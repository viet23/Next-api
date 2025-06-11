import { Entity, Column, ManyToMany, JoinTable } from 'typeorm'
import { BaseEntity } from './base.entity'
import { Group } from './group.entity'

@Entity({ name: 'tbl_role' })
export class Role extends BaseEntity {
  @Column({ name: 'name', unique: true })
  name: string

  @Column({ name: 'description', nullable: true })
  description: string

  @ManyToMany(() => Group, (group) => group.roles)
  @JoinTable({
    name: 'group_role',
    joinColumn: { name: 'role_id' },
    inverseJoinColumn: { name: 'group_id' },
  })
  group: Group[]
}
