import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm'
import { BaseEntity } from './base.entity'
import { CaseHistoryAction } from '@common/enums/case.enum'
import { User } from './user.entity'

@Entity('case_history')
export class CaseHistory extends BaseEntity {
  @Column({ name: 'ticket_id', nullable: true })
  ticketId: string

  @Column({ name: 'old_data', type: 'jsonb', nullable: true })
  oldData: Record<string, any>

  @Column({ name: 'new_data', type: 'jsonb', nullable: true })
  newData: Record<string, any>

  @Column({ name: 'updated_by_id', nullable: true })
  updatedById: string

  @ManyToOne(() => User, (updateBy) => updateBy.caseHistory)
  @JoinColumn({ name: 'updated_by_id' })
  updateBy: User

  @Column({
    name: 'action',
    type: 'enum',
    enum: CaseHistoryAction,
  })
  action: CaseHistoryAction
}
