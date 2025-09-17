import { Entity, Column, OneToMany, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { UserSubscription } from './user-subscription.entity';


@Entity({ name: 'tbl_subscription_plans' })
export class SubscriptionPlan extends BaseEntity {
  @Index({ unique: true })
  @Column()
  name: string; // Free | Starter | Pro | Enterprise

  @Column({ type: 'int', default: 0 })
  price: number; // VND / tháng

  @Column({ type: 'jsonb', nullable: true })
  features?: string[]; // mô tả tính năng (tuỳ chọn)

  @OneToMany(() => UserSubscription, (sub) => sub.plan)
  subscriptions: UserSubscription[];
}
