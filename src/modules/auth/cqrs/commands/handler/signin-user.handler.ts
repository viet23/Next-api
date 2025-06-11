import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { User } from 'src/models/user.entity'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { SignupUserCommand } from '../impl/signin-user.command'

@CommandHandler(SignupUserCommand)
export class SignUpUserCommandHandler implements ICommandHandler<SignupUserCommand> {
  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) {}
  async execute(command: SignupUserCommand): Promise<User> {
    const { dto } = command
    const user = new User()
    user.phone = dto.phone
    user.username = dto.username
    user.fullName = dto.fullName
    user.password = dto.password
    return this.userRepo.save(user)
  }
}
