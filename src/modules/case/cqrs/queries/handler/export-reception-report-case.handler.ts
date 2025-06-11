import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import _ from 'lodash'
import ExcelJS from 'exceljs'
import { reportReceptionTicketMonth, reportReceptionTicketYear } from '@common/constants/customer'
import { ReportTypeTicketEnum } from '@common/enums/type-report.enum'
import moment from 'moment'
import { ExportReportReceptionCasesQuery } from '../impl/export-reception-report-case.query'
import { ReceptionReportCaseQuery } from '../impl/reception-report-case.query'

@QueryHandler(ExportReportReceptionCasesQuery)
export class ExportReportReceptionCasesQueryHandler implements IQueryHandler<ExportReportReceptionCasesQuery> {
  constructor(private readonly queryBus: QueryBus) {}
  async execute(query: ExportReportReceptionCasesQuery): Promise<any> {
    const { filter, response } = query
    const workbook = new ExcelJS.Workbook()
    let template = reportReceptionTicketYear
    if (filter?.where?.reportType == ReportTypeTicketEnum.MONTH) {
      template = reportReceptionTicketMonth
    }

    let worksheet = await workbook.xlsx.readFile(template).then(() => {
      const worksheet = workbook.getWorksheet('Sheet1')
      return worksheet
    })
    worksheet = await this.exportTicket(worksheet, filter)

    return await workbook.xlsx.write(response)
  }

  private async exportTicket(worksheet, filter) {
    const data = await this.queryBus.execute(new ReceptionReportCaseQuery(filter))
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
    const startCol = 4
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

          if (base?.internalState === '%' && parentBase && grandBase) {
            const parentSum = sumRange(parentBase, 'titleTotal', day)
            const grandSum = sumRange(grandBase, 'grandTotal', day)
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
      extractWithWeek(data, 'grandTotal'),
      totalColumns,
    )

    for (const issue of data.data) {
      worksheet.getRow(rowIndex++).values = this.formatRow(
        issue.department,
        '',
        extractWithWeek(issue, 'titleTotal', issue, data),
        totalColumns,
      )

      for (const internalState of issue.features) {
        worksheet.getRow(rowIndex++).values = this.formatRow(
          '',
          internalState.internalState,
          extractWithWeek(internalState, 'featureTotal', issue, data),
          totalColumns,
        )
      }
    }

    return this.alignment(worksheet)
  }

  private async exportTicketYear(worksheet, data, rowIndex, totalColumns) {
    worksheet.getRow(rowIndex++).values = this.formatRow(
      'Tổng tất cả',
      '',
      this.extractMonthly(data, 'grandTotal', totalColumns),
      totalColumns,
    )
    for (const issue of data.data) {
      worksheet.getRow(rowIndex++).values = this.formatRow(
        issue.department,
        '',
        this.extractMonthly(issue, 'titleTotal', totalColumns),
        totalColumns,
      )

      for (const internalState of issue.features) {
        worksheet.getRow(rowIndex++).values = this.formatRow(
          '',
          internalState.internalState,
          this.extractMonthly(internalState, 'featureTotal', totalColumns),
          totalColumns,
        )
      }
    }
    return this.alignment(worksheet)
  }

  private extractMonthly(base, prefix, totalColumns) {
    return Array.from({ length: totalColumns + 1 }, (_, i) => base[`${prefix}${i === 0 ? '' : i}`])
  }

  private formatRow(label1, label2, values, totalColumns) {
    return [
      label1,
      label2,
      ...Array.from({ length: totalColumns + 1 }, (_, i) =>
        this.formatData(label1 || label2 , values[i] ?? 0),
      ),
    ]
  }

  private alignment(worksheet) {
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber < 4) return

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber < 3) return
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
