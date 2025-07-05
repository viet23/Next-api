import { Entity, Column, BeforeInsert, ManyToMany, JoinTable, OneToMany } from 'typeorm'
import { createHmac } from 'crypto'
import { BaseEntity } from './base.entity'
import { Group } from './group.entity'
import { FacebookAd } from './facebook-ad.entity'

@Entity({ name: 'tbl_users' })
export class User extends BaseEntity {
  @Column({ name: 'username', unique: true })
  username: string

  @Column({ name: 'phone', unique: true, nullable: true })
  phone: string

  @Column({ name: 'extension', nullable: true })
  extension: string

  @Column({ name: 'access_token', nullable: true })
  accessToken: string

  @Column({ name: 'id_page', nullable: true })
  idPage: string

  @Column({ name: 'access_token_user', nullable: true })
  accessTokenUser: string

  @Column({ name: 'account_ads_id', nullable: true })
  accountAdsId: string

  @Column({ name: 'full_name', nullable: true })
  fullName: string

  @Column({ name: 'password' })
  password: string

  @Column({ name: 'facebook_id', nullable: true, unique: true })
  facebookId: string

  @Column({ name: 'email', nullable: true, unique: true })
  email: string

  @Column({ name: 'avatar', nullable: true })
  avatar: string

  @Column({ name: 'provider', nullable: true })
  provider: string

  @BeforeInsert()
  encryptPassword(): void {
    this.password = createHmac('sha256', this.password).digest('hex')
  }

  @ManyToMany(() => Group, (group) => group.users)
  @JoinTable({
    name: 'group_user',
    joinColumn: { name: 'user_id' },
    inverseJoinColumn: { name: 'group_id' },
  })
  groups: Group[]

  @Column({ name: 'is_active', default: false })
  isActive: boolean

  @OneToMany(() => FacebookAd, (ad) => ad.createdBy)
  facebookAds: FacebookAd[]
}
