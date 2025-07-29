import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { User } from 'src/models/user.entity'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { NotFoundException, UnauthorizedException } from '@nestjs/common'
import { CreateUserCommand } from '../impl/create-user.command'

@CommandHandler(CreateUserCommand)
export class CreateUserCommandHandler implements ICommandHandler<CreateUserCommand> {
  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) { }
  async execute(command: CreateUserCommand): Promise<User> {
    const { username, password, email,phone ,zalo } = command?.createUserDto
    let user = await this.userRepo.findOne({
      where: [
        { email: email }
      ]
    });
    if (user) {
      throw new NotFoundException('User already exists')
    }
    console.log(`command?.createUserDto`, command?.createUserDto);

    user = new User()
    user.email = email
    user.username = email
    user.fullName = username
    user.password = password
    user.phone = phone
    user.zalo = zalo
    return this.userRepo.save(user)
  }
}
