import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import ExcelJS from 'exceljs'
import { Customers } from '@models/customer.entity'
import { ExportCustomersQuery } from '../impl/export-customers.query'
import { COLUMNS, GenderEnum, ROW_INDEX, templateDir } from '@common/constants/customer'
import { CustomerEnum } from '@common/enums/gender.enum'
@QueryHandler(ExportCustomersQuery)
export class ExportCustomersQueryHandler implements IQueryHandler<ExportCustomersQuery> {
  constructor(@InjectRepository(Customers) private readonly customerRepo: Repository<Customers>) {}
  async execute(query: ExportCustomersQuery): Promise<any> {
    const { filter, response } = query
    const queryBulider = await this.customerRepo.createQueryBuilder('c')
    if (filter?.where) {
      const { where } = filter
      where?.fullName &&
        queryBulider.where('unaccent(c.fullName) ILIKE unaccent(:term)', { term: `%${where.fullName}%` })
      where?.email && queryBulider.andWhere('c.email  ILIKE :email', { email: `%${where.email}%` })
      where?.phone && queryBulider.andWhere('c.phone =:phone', { phone: where.phone })
      where?.gender && queryBulider.andWhere('c.gender =:gender', { gender: where.gender })
      where?.dateOfBirth && queryBulider.andWhere('c.dateOfBirth =:dateOfBirth', { dateOfBirth: where.dateOfBirth })
      where?.isSuspect && queryBulider.andWhere('c.isSuspect =:isSuspect', { isSuspect: where.isSuspect })
    }

    const data = await queryBulider.getMany()

    const workbook = new ExcelJS.Workbook()
    const worksheet = await workbook.xlsx.readFile(templateDir).then(() => {
      const worksheet = workbook.getWorksheet('Sheet1')
      return worksheet
    })

    const exportesColumns = Object.keys(COLUMNS)
    data.forEach((dataRow: Customers, index: number) => {
      worksheet.getRow(ROW_INDEX + index).values = [
        index + 1,
        dataRow.fullName,
        dataRow.dateOfBirth,
        dataRow.phone,
        dataRow.email,
        dataRow.gender == CustomerEnum.MALE ? GenderEnum.MALE : GenderEnum.FEMALE,
      ]
      exportesColumns.forEach((column) => {
        worksheet.getCell(`${column}${ROW_INDEX + index}`).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        }
      })
    })

    return await workbook.xlsx.write(response)
  }
}
