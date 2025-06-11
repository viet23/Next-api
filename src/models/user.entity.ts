import { Entity, Column, BeforeInsert, ManyToMany, JoinTable, OneToMany } from 'typeorm'
import { createHmac } from 'crypto'
import { BaseEntity } from './base.entity'
import { Group } from './group.entity'
import { Case } from './case.entity'
import { CaseHistory } from './case-history.entity'

@Entity({ name: 'tbl_users' })
export class User extends BaseEntity {
  @Column({ name: 'username', unique: true })
  username: string

  @Column({ name: 'phone', unique: true, nullable: true })
  phone: string

  @Column({ name: 'extension', nullable: true })
  extension: string

  @Column({ name: 'full_name', nullable: true })
  fullName: string

  @Column({ name: 'password' })
  password: string

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

  @OneToMany(() => CaseHistory, (caseHistory) => caseHistory.updateBy)
  caseHistory: CaseHistory[]

  
}
