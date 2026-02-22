import { Entity, Column, OneToOne, JoinColumn } from 'typeorm'
import { BaseEntity } from './base.entity'
import { User } from './user.entity'

@Entity({ name: 'tbl_business_profiles' })
export class BusinessProfile extends BaseEntity {
  @Column({ name: 'business_name', nullable: true })
  businessName: string

  @Column({ name: 'business_location', nullable: true })
  businessLocation: string

  @Column({ type: 'jsonb', nullable: true })
  businessFields: { id: number; value: string }[]

  @Column({ name: 'sales_type', nullable: true })
  salesType: string

  @Column({ name: 'selected_location', nullable: true })
  selectedLocation: string

  @Column({ name: 'location_detail', nullable: true })
  locationDetail: string

  @Column({ name: 'product_service', nullable: true })
  productService: string

  @Column({ name: 'target_customer', nullable: true })
  targetCustomer: string

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User
}