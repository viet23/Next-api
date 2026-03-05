import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { BaseEntity } from './base.entity'
import { User } from './user.entity'

@Entity({ name: 'information_post' })
export class InformationPost extends BaseEntity {
  @Column({ name: 'post_id', type: 'varchar' })
  postId: string

  @Column({ name: 'caption', type: 'text', nullable: true })
  caption: string

  @Column({ name: 'url_post', type: 'varchar', nullable: true })
  urlPost: string

  @Column({ name: 'data_rewrite', type: 'text', nullable: true })
  dataRewrite: string

  @ManyToOne(() => User, (user) => user.informationPosts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User
}