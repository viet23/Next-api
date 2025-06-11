import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GetUserAuthQuery } from '../impl/get-user-auth.query'
import { InjectRepository } from '@nestjs/typeorm'
import { User } from 'src/models/user.entity'
import { Repository } from 'typeorm'
import { JwtService } from '@nestjs/jwt'
import { UnauthorizedException } from '@nestjs/common'
import _ from 'lodash'
@QueryHandler(GetUserAuthQuery)
export class GetUserAuthQueryHandler implements IQueryHandler<GetUserAuthQuery> {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private jwtService: JwtService,
  ) {}
  async execute(query: GetUserAuthQuery): Promise<any> {
    const { userId } = query
    const user = await this.userRepo.findOne(userId)
    if (!user) {
      throw new UnauthorizedException('User find not found')
    }
    return _.omit(user, ['updatedAt', 'createdAt', 'password'])
  }
}
