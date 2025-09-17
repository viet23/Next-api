import { Entity, Column, ManyToOne, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

@Entity({ name: 'tbl_user_subscriptions' })
export class UserSubscription extends BaseEntity {
  @ManyToOne(() => User, (user) => user.subscriptions, { nullable: false })
  user: User;

  @ManyToOne(() => SubscriptionPlan, (plan) => plan.subscriptions, { nullable: false, eager: true })
  plan: SubscriptionPlan;

  @Index()
  @Column({ type: 'timestamp' })
  startDate: Date;

  @Index()
  @Column({ type: 'timestamp' })
  endDate: Date;

  @Column({ type: 'bool', default: false })
  isPaid: boolean; // đã thanh toán hay chưa
}
