import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { User } from 'src/models/user.entity'
import { Repository } from 'typeorm'
import { JwtService } from '@nestjs/jwt'
import { NotFoundException } from '@nestjs/common'
import _ from 'lodash'
import { SignInQuery } from '../impl/signin.query'
import { createHmac } from 'crypto'
@QueryHandler(SignInQuery)
export class SignInQueryHandler implements IQueryHandler<SignInQuery> {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private jwtService: JwtService,
  ) {}
  async execute(query: SignInQuery): Promise<any> {
    const { dto } = query
    console.log(`dto`, dto)

    const user = await this.userRepo
      .createQueryBuilder()
      .where('email =:email', { email: dto.username })
      .andWhere('password =:password', { password: createHmac('sha256', dto.password).digest('hex') })
      .getOne()
    if (!user) {
      throw new NotFoundException('User find not found !')
    }
    const payload = _.omit(user, ['updatedAt', 'createdAt', 'password'])
    return {
      token: this.jwtService.sign(payload),
      user: payload,
    }
  }
}
