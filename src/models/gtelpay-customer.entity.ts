import { Column, Entity, JoinTable, ManyToMany, OneToMany } from 'typeorm'
import { BaseEntity } from './base.entity'
import { IsSusPectEnum } from '@common/enums/suspect.enum'


@Entity({ name: 'customers' })
export class GtelpayCustomer extends BaseEntity {
  @Column({ name: 'customer_id', unique: true, type: 'bigint' })
  customerId: number

  @Column({ name: 'customer_ref_id', nullable: true })
  customerRefId: string

  @Column({ name: 'customer_name', nullable: true })
  customerName: string

  @Column({ name: 'status', type: 'smallint' })
  status: number

  @Column({ name: 'phone_no', nullable: true })
  phoneNo: string

  @Column({ name: 'available_balance', type: 'numeric', precision: 32, scale: 3, default: 0 })
  availableBalance: number

  @Column({ name: 'postal_code', nullable: true })
  postalCode: string

  @Column({ name: 'email', nullable: true })
  email: string

  @Column({ name: 'customer_type', nullable: true })
  customerType: string

  @Column({ name: 'date_of_birth', nullable: true })
  dateOfBirth: string

  @Column({ name: 'gender', nullable: true })
  gender: string

  @Column({ name: 'created_date', nullable: true })
  createdDate: string

  @Column({ name: 'approved_date', nullable: true })
  approvedDate: string

  @Column({ name: 'last_update_time', nullable: true })
  updateDate: string

  @Column({ name: 'unlink_bank', length: 10, default: '', nullable: true })
  unlinkBank: string

  @Column({ name: 'relink_bank', length: 10, default: '', nullable: true })
  relinkBank: string

  @Column({ name: 'is_suspect', default: IsSusPectEnum.DEFAULT, type: 'enum', enum: IsSusPectEnum })
  isSuspect: IsSusPectEnum

  @Column({ name: 'scan_date', type: 'timestamp with time zone', nullable: true })
  scanDate: Date

}

