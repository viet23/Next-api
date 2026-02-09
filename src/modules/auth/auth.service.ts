import { Injectable } from '@nestjs/common'
import { RegisterTrialDto } from './dto/register-trial.dto'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { User } from '@models/user.entity'
import { JwtService } from '@nestjs/jwt'

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) 
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService, // 👈 thêm cái này
  ) {}

  // ✅ JWT generator
  generateJwt(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      username: user.username,
    }

    return this.jwtService.sign(payload)
  }

  // ✅ dùng cho login Facebook / Google luôn
  async findOrCreateSocialUser(profile: {
    email: string
    name: string
    facebookId?: string
    photo?: string
  }) {
    let user = await this.userRepo.findOne({
      where: { email: profile.email },
    })

    if (!user) {
      user = this.userRepo.create({
        email: profile.email,
        username: profile.name,
        fullName: profile.name,
        password: '', // social login không cần password
      })

      await this.userRepo.save(user)
    }

    const token = this.generateJwt(user)

    return { user, token }
  }

  // ===== giữ nguyên trial nhưng clean lại =====
  async registerTrial(data: RegisterTrialDto) {
    let user = await this.userRepo.findOne({
      where: { email: data.email },
    })

    if (!user) {
      user = this.userRepo.create({
        username: data.fullName,
        fullName: data.fullName,
        password: 'Ads@123456',
        email: data.email,
        phone: data.phone,
      })

      await this.userRepo.save(user)
    }

    if (!user.phone) {
      user.phone = data.phone
      await this.userRepo.save(user)
    }

    return {
      success: true,
      message: 'Trial account registered successfully',
    }
  }
}
