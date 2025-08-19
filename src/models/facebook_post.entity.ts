import { Entity, Column } from 'typeorm'
import { BaseEntity } from './base.entity'

@Entity({ name: 'facebook_post' })
export class FacebookPost extends BaseEntity {
 
  @Column({ name: 'post_id', type: 'varchar' })
  postId: string

  @Column({ name: 'data_targeting', type: 'jsonb', nullable: true })
  dataTargeting: any

  @Column({ name: 'url_post', type: 'varchar' })
  urlPost: string

  @Column({ name: 'ad_ids', type: 'jsonb', nullable: true })
  adIds: string[]  

  @Column({ name: 'data_score_ad', type: 'jsonb', nullable: true })
  dataScoreAd: any

  @Column({ name: 'data_rewrite', type: 'varchar', nullable: true })
  dataRewrite: string

}
