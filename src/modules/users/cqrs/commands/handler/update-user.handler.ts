import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { User } from 'src/models/user.entity'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { UpdateUserCommand } from '../impl/update-user.command'
import { UnauthorizedException } from '@nestjs/common'

@CommandHandler(UpdateUserCommand)
export class UpdateUserCommandHandler implements ICommandHandler<UpdateUserCommand> {
  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) {}
  async execute(command: UpdateUserCommand): Promise<User> {
    const { userId, dto } = command
    let user = await this.userRepo.findOne(userId)
    if (!user) {
      throw new UnauthorizedException('User find not found')
    }
    user.phone = dto.phone
    user.extension = dto.extension
    user.isActive = dto.isActive
    user.idPage = dto.idPage
    user.accessToken = dto.accessToken
    user.accessTokenUser = dto.accessTokenUser
    user.accountAdsId = dto.accountAdsId
    return this.userRepo.save(user)
  }
}
