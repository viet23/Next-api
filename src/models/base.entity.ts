import { PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, BeforeInsert, BeforeUpdate } from 'typeorm'
export class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: number

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt?: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt?: Date

  @BeforeInsert()
  generateBeforInsert() {
    this.createdAt = new Date()
  }

  @BeforeUpdate()
  doBeforUpdate() {
    this.updatedAt = new Date()
  }
}
