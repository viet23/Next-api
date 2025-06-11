import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { User } from 'src/models/user.entity'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { UnauthorizedException } from '@nestjs/common'
import { CreateUserCommand } from '../impl/create-user.command'

@CommandHandler(CreateUserCommand)
export class CreateUserCommandHandler implements ICommandHandler<CreateUserCommand> {
  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) {}
  async execute(command: CreateUserCommand): Promise<User> {
    const { username, password } = command
    let user = await this.userRepo.findOne({ where: { username } })
    if (user) {
      throw new UnauthorizedException('User already exists')
    }
    user = new User()
    user.username = username
    user.password = password
    return this.userRepo.save(user)
  }
}
