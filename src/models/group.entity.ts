import { Entity, Column, ManyToMany, JoinTable } from 'typeorm'
import { BaseEntity } from './base.entity'
import { Role } from './role.entity'
import { User } from './user.entity'

@Entity({ name: 'tbl_group' })
export class Group extends BaseEntity {
  @Column({ name: 'name', unique: true })
  name: string

  @Column({ name: 'description', nullable: true })
  description: string

  @ManyToMany(() => Role, (role) => role.group)
  @JoinTable({
    name: 'group_role',
    joinColumn: { name: 'group_id' },
    inverseJoinColumn: { name: 'role_id' },
  })
  roles: Role[]

  @ManyToMany(() => User, (role) => role.groups)
  @JoinTable({
    name: 'group_user',
    joinColumn: { name: 'group_id' },
    inverseJoinColumn: { name: 'user_id' },
  })
  users: Role[]
}
