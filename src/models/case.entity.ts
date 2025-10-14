import { Entity, Column, BeforeInsert } from 'typeorm'
import { BaseEntity } from './base.entity'
import moment from 'moment'

@Entity({ name: 'tbl_case' })
export class Case extends BaseEntity {
  @Column({ name: 'code', type: 'varchar', unique: true })
  code: string

  @BeforeInsert()
  updateCode(): void {
    const createdAtFormatted = this.formatDate(this.createdAt || new Date())
    this.code = `GTP${createdAtFormatted}`
  }

  @Column({ name: 'task_id', type: 'varchar', nullable: true })
  taskId: string

  @Column({ name: 'action', type: 'varchar', nullable: true })
  action: string

  private formatDate(date: Date): string {
    return moment(date).format('DDMMYYHHmmssSSS')
  }

  @Column({ name: 'url_video', nullable: true })
  urlVideo: string

  @Column({ name: 'caption', nullable: true })
  caption: string

  @Column({ name: 'updated_by_id', nullable: true })
  updatedById: string
}
