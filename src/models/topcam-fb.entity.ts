import { Entity, Column } from 'typeorm'
import { BaseEntity } from './base.entity'

@Entity({ name: 'topcam_fb' })
export class TopcamFb extends BaseEntity {
  @Column({ name: 'topcam', type: 'jsonb', nullable: true })
  topCam: any

  @Column({ name: 'user_id', nullable: true })
  userId: string
}
