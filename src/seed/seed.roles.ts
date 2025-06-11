import { RoleEnum, RoleGroupEnum } from '@common/enums/roles.enum'
import { Group } from '@models/group.entity'
import { Role } from '@models/role.entity'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

@Injectable()
export class SeedRolesService {
  constructor(
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(Group) private readonly groupRepo: Repository<Group>,
  ) {}

  async seed() {
    const roleNames = Object.values(RoleEnum)
    const roles = await this.findRoles(roleNames)
    let groupAdmin = await this.findGroupAdmin()
    if (!groupAdmin) groupAdmin = new Group()
    groupAdmin.name = RoleGroupEnum.ADMIN
    const mapRoles = roles.map((role) => role.name)
    const names = roleNames.filter((name) => !mapRoles.includes(name))
    const rolesNews = names.map((name) => this.roleRepo.create({ name }))
    const rolesNewDatas = await this.roleRepo.save(rolesNews)
    groupAdmin.roles = [...roles, ...rolesNewDatas]

    return this.groupRepo.save(groupAdmin)
  }

  async findRoles(roleNames) {
    return await this.roleRepo
      .createQueryBuilder('roles')
      .where('roles.name IN (:...names)', { names: roleNames })
      .getMany()
  }

  async findGroupAdmin() {
    return await this.groupRepo
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.roles', 'roles')
      .where('group.name =:name', { name: RoleGroupEnum.ADMIN })
      .getOne()
  }
}
