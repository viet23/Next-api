import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { User } from 'src/models/user.entity'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { SignupUserCommand } from '../impl/signin-user.command'
import { SamlSigninUserCommand } from '../impl/saml-signin-user.command'
import { JwtService } from '@nestjs/jwt'
import _ from 'lodash'
import { RoleGroupEnum } from '@common/enums/roles.enum'
import { Group } from '@models/group.entity'
@CommandHandler(SamlSigninUserCommand)
export class SamlSigninUserCommandHandler implements ICommandHandler<SamlSigninUserCommand> {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Group) private readonly groupRepo: Repository<Group>,
    private jwtService: JwtService,
  ) {}
  async execute(command: SamlSigninUserCommand): Promise<any> {
    const { dto } = command
    const [username, domain] = dto.email.split('@')
    let user = await this.userRepo.findOne({ username: username })
    if (!user) {
      user = new User()
      user.username = username
      user.fullName = username
      user.password = domain
      const checkAdmin = await this.findUserAdmin()
      if (!checkAdmin) user.groups = [await this.findGroupAdmin()]
    }
    const saved = await this.userRepo.save(user)
    const payload = _.omit(saved, ['updatedAt', 'createdAt', 'password'])
    return this.jwtService.sign(payload)
  }

  async findUserAdmin() {
    return await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.groups', 'groups')
      .where('groups.name =:name', { name: RoleGroupEnum.ADMIN })
      .getOne()
  }

  async findGroupAdmin() {
    return await this.groupRepo
      .createQueryBuilder('group')
      .where('group.name =:name', { name: RoleGroupEnum.ADMIN })
      .getOne()
  }
}
