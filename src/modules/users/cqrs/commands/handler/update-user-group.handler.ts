import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { UpdateUserGroupCommand } from '../impl/update-user-group.command'
import { InjectRepository } from '@nestjs/typeorm'
import { User } from '@models/user.entity'
import { Repository } from 'typeorm'
import { NotFoundException } from '@nestjs/common'
import { use } from 'passport'
import { Group } from '@models/group.entity'

@CommandHandler(UpdateUserGroupCommand)
export class UpdateUserGroupCommandHandler implements ICommandHandler<UpdateUserGroupCommand> {
  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) {}
  async execute(command: UpdateUserGroupCommand): Promise<any> {
    const { dto, userId } = command
    const user = await this.userRepo.findOne(userId, { relations: ['groups'] })
    if (!user) {
      throw new NotFoundException('Find not found user')
    }
    if (dto.extension) user.extension = dto.extension
    if (dto.fullName) user.fullName = dto.fullName
    if (dto.isActive) user.isActive = dto.isActive
    user.idPage = dto.idPage
    user.credits = dto.credits
    user.phone = dto.phone
    user.zalo = dto.zalo
    user.accessToken = dto.accessToken
    user.accessTokenUser = dto.accessTokenUser
    user.accountAdsId = dto.accountAdsId
    user.groups = dto.groupIds.map((groupId) => Object.assign(new Group(), { id: groupId }))

    return this.userRepo.save(user)
  }
}
