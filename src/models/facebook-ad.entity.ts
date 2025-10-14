import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm'
import { User } from './user.entity'
import { FacebookCampaign } from './facebook_campaign.entity'

@Entity({ name: 'facebook_ads' })
export class FacebookAd {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ name: 'ad_id', unique: true })
  adId: string

  // (Giữ lại để dễ lọc/hiển thị nhanh; có thể bỏ nếu muốn chuẩn hoá tuyệt đối)
  @Column({ name: 'campaign_name', nullable: true })
  campaignName?: string

  @Column({ name: 'caption', type: 'text', nullable: true })
  caption?: string

  @Column({ name: 'objective', nullable: true })
  objective?: string

  @Column({ name: 'data_targeting', type: 'jsonb', nullable: true })
  dataTargeting: any

  @Column({ name: 'url_post', type: 'varchar', nullable: true })
  urlPost: string

  @Column({ name: 'start_time', type: 'timestamptz', nullable: true })
  startTime?: Date

  @Column({ name: 'end_time', type: 'timestamptz', nullable: true })
  endTime?: Date

  @Column({ name: 'daily_budget', type: 'int', nullable: true })
  dailyBudget?: number

  @Column({ name: 'status', default: 'ACTIVE', nullable: true })
  status?: string

  // 🔗 nhiều quảng cáo thuộc 1 chiến dịch
  @ManyToOne(() => FacebookCampaign, (campaign) => campaign.ads, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id_ref' })
  campaign: FacebookCampaign

  @ManyToOne(() => User, (user) => user.facebookAds, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  createdBy: User

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date
}
