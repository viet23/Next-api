import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import _ from 'lodash'
import ExcelJS from 'exceljs'
import { reportTicketMonth, reportTicketYear } from '@common/constants/customer'
import { ExportReportCasesQuery } from '../impl/export-report-case.query'
import { ReportCaseQuery } from '../impl/report-case.query'
import { ReportTypeTicketEnum } from '@common/enums/type-report.enum'
import moment from 'moment'

@QueryHandler(ExportReportCasesQuery)
export class ExportReportCasesQueryHandler implements IQueryHandler<ExportReportCasesQuery> {
  constructor(private readonly queryBus: QueryBus) {}
  async execute(query: ExportReportCasesQuery): Promise<any> {
    const { filter, response } = query
    const workbook = new ExcelJS.Workbook()
    let template = reportTicketYear
    if (filter?.where?.reportType == ReportTypeTicketEnum.MONTH) {
      template = reportTicketMonth
    }
    let worksheet = await workbook.xlsx.readFile(template).then(() => {
      const worksheet = workbook.getWorksheet('Sheet1')
      return worksheet
    })
    worksheet = await this.exportTicket(worksheet, filter)

    return await workbook.xlsx.write(response)
  }

  private async exportTicket(worksheet, filter) {
    // const data = await this.queryBus.execute(new ReportCaseQuery(filter))
    const data = []
    let rowIndex = 4
    let totalColumns = 12
    // Tổng tất cả

    if (filter?.where?.reportType == ReportTypeTicketEnum.MONTH) {
      totalColumns = moment(filter?.where?.dateTime).daysInMonth()
      worksheet.getCell('A1').value = `Báo cáo tháng : ${moment(filter?.where?.dateTime).format('MM/YYYY')}`
      return this.exportTicketMonth(worksheet, data, filter, rowIndex, totalColumns)
    } else {
      worksheet.getCell('A1').value = `Báo tổng hợp năm : ${moment(filter?.where?.dateTime).format('YYYY')}`
      return this.exportTicketYear(worksheet, data, rowIndex, totalColumns)
    }
  }

  private async exportTicketMonth(worksheet, data, filter, rowIndex, totalDays) {
    const startCol = 5
    const dateBase = moment(filter?.where?.dateTime || undefined)

    // Ghi header ngày + tổng tuần
    const headerRow = worksheet.getRow(3)
    let colOffset = startCol
    let totalColumns = 0
    let weekTitle = 1
    for (let day = 0; day < totalDays; day++) {
      headerRow.getCell(colOffset++).value = `Ngày ${day + 1}`
      totalColumns++

      const isSundayOrLast =
        dateBase
          .clone()
          .date(day + 1)
          .day() === 0 || day + 1 === totalDays
      if (isSundayOrLast) {
        headerRow.getCell(colOffset++).value = `Tuần ${weekTitle}`
        totalColumns++
        weekTitle++
      }
    }
    headerRow.commit()

    // Tính tổng tuần
    const sumRange = (obj, prefix, day) => {
      let sum = 0
      const start = day - (dateBase.clone().date(day).day() || 6)

      for (let d = start; d <= day; d++) {
        sum += obj?.[`${prefix}${d}`] ?? 0
      }

      return sum
    }

    // Xuất dòng dữ liệu có xử lý tổng tuần cho dữ liệu %
    const extractWithWeek = (base, prefix: string, parentBase?: any, grandBase?: any) => {
      const result: (number | string)[] = []
      let weekSum = 0
      let weekIndex = 1

      const value = base?.[prefix] ?? 0
      result.push(this.formatData(prefix, value))

      for (let day = 1; day <= totalDays; day++) {
        const val = base?.[`${prefix}${day}`] ?? 0
        result.push(this.formatData(prefix, val))
        weekSum += val

        const isSundayOrLast = dateBase.clone().date(day).day() === 0 || day === totalDays
        if (isSundayOrLast) {
          let weekValue: any = weekSum

          if (base?.feature === '%' && parentBase && grandBase) {
            const parentSum = sumRange(parentBase, 'titleTotal', day)
            const grandSum = sumRange(grandBase, 'grandTotal', day)
            weekValue = grandSum ? Math.round((parentSum / grandSum) * 100) : ' - '
          }

          if (base?.featureDetails === '%' && parentBase && grandBase) {
            const parentSum = sumRange(parentBase, 'featureTotal', day)
            const grandSum = sumRange(grandBase, 'titleTotal', day)
            weekValue = grandSum ? Math.round((parentSum / grandSum) * 100) : ' - '
          }

          result.push(this.formatData(prefix, weekValue))
          weekSum = 0
          weekIndex++
        }
      }

      return result
    }

    // Tổng tất cả
    worksheet.getRow(rowIndex++).values = this.formatRow(
      'Tổng tất cả',
      '',
      '',
      extractWithWeek(data, 'grandTotal'),
      totalColumns,
    )

    for (const issue of data.data) {
      worksheet.getRow(rowIndex++).values = this.formatRow(
        issue.title,
        '',
        '',
        extractWithWeek(issue, 'titleTotal', issue, data),
        totalColumns,
      )

      for (const feature of issue.features) {
        worksheet.getRow(rowIndex++).values = this.formatRow(
          '',
          feature.feature,
          '',
          extractWithWeek(feature, 'featureTotal', issue, data),
          totalColumns,
        )

        for (const detail of feature.featureDetails) {
          worksheet.getRow(rowIndex++).values = this.formatRow(
            '',
            '',
            detail.featureDetails,
            extractWithWeek(detail, 'titleTotal', feature, issue),
            totalColumns,
          )
        }
      }
    }

    return this.alignment(worksheet)
  }

  private async exportTicketYear(worksheet, data, rowIndex, totalColumns) {
    worksheet.getRow(rowIndex++).values = this.formatRow(
      'Tổng tất cả',
      '',
      '',
      this.extractMonthly(data, 'grandTotal', totalColumns),
      totalColumns,
    )
    for (const issue of data.data) {
      worksheet.getRow(rowIndex++).values = this.formatRow(
        issue.title,
        '',
        '',
        this.extractMonthly(issue, 'titleTotal', totalColumns),
        totalColumns,
      )

      for (const feature of issue.features) {
        worksheet.getRow(rowIndex++).values = this.formatRow(
          '',
          feature.feature,
          '',
          this.extractMonthly(feature, 'featureTotal', totalColumns),
          totalColumns,
        )

        for (const detail of feature.featureDetails) {
          worksheet.getRow(rowIndex++).values = this.formatRow(
            '',
            '',
            detail.featureDetails,
            this.extractMonthly(detail, 'totalReports', totalColumns),
            totalColumns,
          )
        }
      }
    }
    return this.alignment(worksheet)
  }

  private extractMonthly(base, prefix, totalColumns) {
    return Array.from({ length: totalColumns + 1 }, (_, i) => base[`${prefix}${i === 0 ? '' : i}`])
  }

  private formatRow(label1, label2, label3, values, totalColumns) {
    return [
      label1,
      label2,
      label3,
      ...Array.from({ length: totalColumns + 1 }, (_, i) =>
        this.formatData(label1 || label2 || label3, values[i] ?? 0),
      ),
    ]
  }

  private alignment(worksheet) {
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber < 4) return

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber < 4) return
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'right',
        }
      })
    })
    return worksheet
  }

  private formatData(feature, value) {
    if (value && value != undefined && value != ' - ') {
      return feature == '%' ? value + ' %' : value
    } else {
      return ' - '
    }
  }
}
