import { Entity, Column, Index } from 'typeorm'
import { BaseEntity } from './base.entity'

@Entity({ name: 'ad_insight' })
export class AdInsight extends BaseEntity {
  /** Tham chiếu quảng cáo */
  @Index()
  @Column({ name: 'ad_id', type: 'varchar' })
  adId: string

  /** Tên chiến dịch */
  @Column({ name: 'campaign_name', type: 'varchar', nullable: true })
  campaignName?: string

  /** Người tạo (email) */
  @Column({ name: 'created_by_email', type: 'varchar', nullable: true })
  createdByEmail?: string

  /** 👁 Hiển thị */
  @Column({ name: 'impressions', type: 'varchar', default: '0' })
  impressions: string

  /** 🙋‍♂️ Reach */
  @Column({ name: 'reach', type: 'varchar', default: '0' })
  reach: string

  /** 🔁 Tần suất */
  @Column({ name: 'frequency', type: 'varchar', default: '0' })
  frequency: string

  /** 🖱 Click */
  @Column({ name: 'clicks', type: 'varchar', default: '0' })
  clicks: string

  /** 🔗 Link Click */
  @Column({ name: 'inline_link_clicks', type: 'varchar', default: '0' })
  inlineLinkClicks: string

  /** 💸 Chi phí (VNĐ) */
  @Column({ name: 'spend_vnd', type: 'varchar', default: '0' })
  spendVnd: string

  /** 📊 CTR (%) */
  @Column({ name: 'ctr_percent', type: 'varchar', default: '0' })
  ctrPercent: string

  /** CPM (VNĐ) */
  @Column({ name: 'cpm_vnd', type: 'varchar', default: '0' })
  cpmVnd: string

  /** CPC (VNĐ) */
  @Column({ name: 'cpc_vnd', type: 'varchar', default: '0' })
  cpcVnd: string

  /** 📌 Tổng tương tác */
  @Column({ name: 'total_engagement', type: 'varchar', default: '0' })
  totalEngagement: string

  /**
   * Chi tiết tương tác: lưu JSON dạng string
   * Ghi: JSON.stringify(details)
   * Đọc: JSON.parse(engagementDetails)
   */
  @Column({ name: 'engagement_details', type: 'text', nullable: true })
  engagementDetails?: string

  /** Gợi ý tối ưu từ AI (plain text) */
  @Column({ name: 'recommendation', type: 'text', nullable: true })
  recommendation?: string

  /** HTML Report (nguyên khối HTML) */
  @Column({ name: 'html_report', type: 'text', nullable: true })
  htmlReport?: string

  /** Liên kết người dùng nếu cần */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId?: string

  @Column({ name: 'is_active', default: false })
  isActive: boolean
}
