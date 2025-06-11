import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { User } from 'src/models/user.entity'
import { Repository } from 'typeorm'
import { JwtService } from '@nestjs/jwt'
import { UnauthorizedException } from '@nestjs/common'
import _ from 'lodash'
import { GetCurrentUserQuery } from '../impl/get-current-user.query'
@QueryHandler(GetCurrentUserQuery)
export class GetCurrentUserQueryHandler implements IQueryHandler<GetCurrentUserQuery> {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private jwtService: JwtService,
  ) {}
  async execute(query: GetCurrentUserQuery): Promise<any> {
    const { userId } = query
    const user = await this.userRepo.findOne(userId)
    if (!user) {
      throw new UnauthorizedException('User find not found')
    }
    const payload = _.omit(user, ['updatedAt', 'createdAt', 'password'])
    return {
      token: this.jwtService.sign(payload),
      user: payload,
    }
  }
}
