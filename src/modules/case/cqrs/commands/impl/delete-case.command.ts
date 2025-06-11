import { Command } from '@nestjs-architects/typed-cqrs'
import { DeleteResult } from 'typeorm'

export class DeleteCaseCommand extends Command<DeleteResult> {
  constructor(public readonly id: string) {
    super()
  }
}
