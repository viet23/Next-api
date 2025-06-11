import { Role } from '@models/role.entity'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SeedRolesService } from './seed.roles'
import { Group } from '@models/group.entity'

@Module({
  imports: [TypeOrmModule.forFeature([Role, Group])],
  exports: [SeedRolesService],
  providers: [SeedRolesService],
})
export class SeedModule {}
