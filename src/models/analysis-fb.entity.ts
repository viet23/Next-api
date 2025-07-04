import { Entity, Column } from 'typeorm'
import { BaseEntity } from './base.entity'

@Entity({ name: 'analysis_fb' })
export class AnalysisFb extends BaseEntity {
  @Column({ name: 'url_page', type: 'varchar', unique: true })
  urlPage: string

  @Column({ name: 'analysis', type: 'jsonb', nullable: true })
  analysis: any

  @Column({ name: 'channel_plan', type: 'jsonb', nullable: true })
  channelPlan: any

  @Column({ name: 'user_id', nullable: true })
  userId: string
}
