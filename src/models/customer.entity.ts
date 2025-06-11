import { Column, Entity, JoinTable, ManyToMany } from 'typeorm'
import { BaseEntity } from './base.entity'
import { CustomerEnum } from 'src/common/enums/gender.enum'
import { IsSusPectEnum } from '@common/enums/suspect.enum'

@Entity({ name: 'tbl_customers' })
export class Customers extends BaseEntity {

  @Column({ name: 'customer_id', type: 'bigint', unique: true })
  customerId: number

  @Column({ name: 'full_name' })
  fullName: string

  @Column({ name: 'phone' })
  phone: string

  @Column({ name: 'email', nullable: true })
  email: string

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: Date

  @Column({ name: 'gender', type: 'enum', enum: CustomerEnum, default: CustomerEnum.MALE, nullable: true })
  gender: CustomerEnum

  @Column({ name: 'register_date', type: 'timestamp', nullable: true })
  registerDate: Date

  @Column({ name: 'kyc_date', type: 'timestamp', nullable: true })
  kycDate: Date

  @Column({ name: 'is_suspect', default: IsSusPectEnum.DEFAULT, type: 'enum', enum: IsSusPectEnum })
  isSuspect: IsSusPectEnum

  @Column({ name: 'scan_date', type: 'timestamp with time zone', nullable: true })
  scanDate: Date
}
