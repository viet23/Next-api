import { Entity, Column } from 'typeorm'
import { BaseEntity } from './base.entity'

@Entity({ name: 'tbl_credit_transaction' })
export class CreditTransaction extends BaseEntity {
  @Column({ name: 'payment_date', type: 'timestamp' })
  paymentDate: Date

  @Column({ name: 'amount_paid_vnd', type: 'int' })
  amountPaidVnd: number

  @Column({ name: 'credits_purchased', type: 'int' })
  creditsPurchased: number

  @Column({ name: 'code', type: 'varchar' , nullable: true })
  code: string

  @Column({ name: 'updated_by_id', nullable: true })
  updatedById: string
}
