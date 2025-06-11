import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { Case } from '@models/case.entity'
import { applyDateYear } from 'src/utils/apply-year'
import { applyDateMonth } from 'src/utils/apply-month'
import moment from 'moment'
import { ReportTypeTicketEnum } from '@common/enums/type-report.enum'
import { applyDayTime } from 'src/utils/apply-day'
import { calculatePercentage } from 'src/utils/calculate-percentage'
import { ReceptionReportCaseQuery } from '../impl/reception-report-case.query'

@QueryHandler(ReceptionReportCaseQuery)
export class ReceptionReportCaseQueryHandler implements IQueryHandler<ReceptionReportCaseQuery> {
  constructor(@InjectRepository(Case) private readonly caseRepo: Repository<Case>) {}

  async execute(q: ReceptionReportCaseQuery): Promise<any> {
    const { filter } = q
    const year = moment(filter?.where?.dateTime).format('YYYY')

    if (filter?.where?.reportType == ReportTypeTicketEnum.YEAR) {
      const { startYear, endYear } = applyDateYear(year)
      const reportAll = await this.getReport(startYear, endYear)
      for (let i = 0; i < 12; i++) {
        const month = i + 1
        const { startMonth, endMonth } = applyDateMonth(year, month)
        const reportMonth = await this.getReport(startMonth, endMonth)
        const data = await this.mergeData(
          reportAll.data,
          reportMonth.data,
          month,
          reportMonth.grandTotal,
          reportAll.grandTotal,
        )
        reportAll[`grandTotal${month}`] = reportMonth.grandTotal
        reportAll.data = data
      }

      return reportAll
    }

    if (filter.where.reportType == ReportTypeTicketEnum.MONTH) {
      const month = moment(filter?.where?.dateTime).format('MM')
      const totalColumns = moment(filter?.where?.dateTime).daysInMonth()
      const { startMonth, endMonth } = applyDateMonth(year, month)
      const reportMonth = await this.getReport(startMonth, endMonth)

      for (let i = 0; i < totalColumns; i++) {
        const date = i + 1
        const { startOfDay, endOfDay } = applyDayTime(`${year}-${month}-${date}`)
        const reportDate = await this.getReport(startOfDay, endOfDay)
        const data = await this.mergeData(
          reportMonth.data,
          reportDate.data,
          date,
          reportDate.grandTotal,
          reportMonth.grandTotal,
        )
        reportMonth[`grandTotal${date}`] = reportDate.grandTotal
        reportMonth.data = data
      }

      return reportMonth
    }
  }

  async mergeData(reportAll, reportDetail, key, grandTotal, totalAll): Promise<any> {
    let mapB = new Map(reportDetail.map((item) => [item.department, item]))

    reportAll.forEach((itemAll) => {
      let itemDetail = mapB.get(itemAll.department)
      if (!itemDetail) return
      itemAll[`titleTotal${key}`] = itemDetail['titleTotal']

      let featureMapDetail = new Map(itemDetail['features'].map((f) => [f.internalState, f]))

      itemAll.features.forEach((featureAll) => {
        let featureDetail = featureMapDetail.get(featureAll.internalState)
        if (!featureDetail) return

        featureAll[`featureTotal${key}`] = featureDetail['featureTotal']
      })

      let percentageFeature = itemAll.features.find((f) => f.internalState === '%')

      if (!percentageFeature) {
        percentageFeature = {
          internalState: '%',
          featureDetails: [],
          featureTotal: parseInt(calculatePercentage(itemAll.titleTotal, totalAll)),
        }
        itemAll.features.unshift(percentageFeature)
      }

      percentageFeature[`featureTotal${key}`] = parseInt(calculatePercentage(itemAll[`titleTotal${key}`], grandTotal))
    })

    return reportAll
  }

  async getReport(startDate?, endDate?): Promise<any> {
    const query = this.caseRepo
      .createQueryBuilder('case')
      .select('case.department', 'department')
      .addSelect('case.internalState', 'internalState')
      .addSelect('COUNT(*)', 'total_reports')
      .groupBy('case.department')
      .addGroupBy('case.internalState')
      .orderBy('case.department', 'ASC')
      .addOrderBy('case.internalState', 'ASC')
      .addOrderBy('total_reports', 'DESC')

    startDate && query.andWhere('case.createdAt >= :startDate', { startDate })
    endDate && query.andWhere('case.createdAt <= :endDate', { endDate })

    const rawData = await query.getRawMany()
    return await this.groupedData(rawData)
  }

  async groupedData(rawData): Promise<any> {
    const groupedData = rawData.reduce((acc, item) => {
      const { department, internalState, featureDetails, total_reports } = item

      if (!acc[department]) {
        acc[department] = { department, features: {}, titleTotal: 0 }
      }

      if (!acc[department].features[internalState]) {
        acc[department].features[internalState] = { internalState, featureDetails: [], featureTotal: 0 }
      }

      acc[department].features[internalState].featureTotal += parseInt(total_reports)

      acc[department].titleTotal += parseInt(total_reports)

      return acc
    }, {})

    const grandTotal = Object.values(groupedData).reduce((sum, titleItem: any) => {
      return sum + titleItem.titleTotal
    }, 0)

    const result = Object.values(groupedData).map((titleItem: any) => ({
      department: titleItem.department,
      titleTotal: titleItem.titleTotal,
      features: Object.values(titleItem.features).map((featureItem: any) => ({
        internalState: featureItem.internalState,
        featureTotal: featureItem.featureTotal,
        featureDetails: featureItem.featureDetails,
      })),
    }))

    return { data: result, grandTotal }
  }
}
