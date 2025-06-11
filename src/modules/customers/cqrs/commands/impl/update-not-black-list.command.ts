import { Command } from '@nestjs-architects/typed-cqrs'
import { UpdateResult } from 'typeorm'

export class UpdateNotBlackListCommand extends Command<UpdateResult> {
  constructor(public readonly id: string) {
    super()
  }
}
