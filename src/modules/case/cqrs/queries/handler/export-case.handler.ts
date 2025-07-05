import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import _ from 'lodash'
import ExcelJS from 'exceljs'
import { ROW_INDEX, formatTicketDate, templateTicket } from '@common/constants/customer'
import { ExportCasesQuery } from '../impl/export-case.query'
import { GetCaseQuery } from '../impl/get-case.query'
import { Case } from '@models/case.entity'
import moment from 'moment'

@QueryHandler(ExportCasesQuery)
export class ExportCasesQueryHandler implements IQueryHandler<ExportCasesQuery> {
  constructor(private readonly queryBus: QueryBus) {}
  async execute(query: ExportCasesQuery): Promise<any> {
    const { filter, response } = query
    const workbook = new ExcelJS.Workbook()
    let worksheet = await workbook.xlsx.readFile(templateTicket).then(() => {
      const worksheet = workbook.getWorksheet('Sheet1')
      return worksheet
    })
    worksheet = await this.exportTicket(worksheet, filter)

    return await workbook.xlsx.write(response)
  }

  private async exportTicket(worksheet, filter) {
    delete filter.page
    delete filter.pageSize
    // const { data } = await this.queryBus.execute(new GetCaseQuery(filter))
    const data = []
    data.forEach((row: Case, index: number) => {
      worksheet.getRow(ROW_INDEX + index).values = [
        row.code || '',
        row.createdAt ? moment(row.createdAt).format(formatTicketDate) : '',
      ]
    })

    return worksheet
  }
}
