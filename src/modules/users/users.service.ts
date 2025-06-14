import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/models/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Đăng nhập bằng Facebook: Tìm hoặc tạo mới user
   */
  async findOrCreateFromFacebook(profile: any): Promise<User> {
    const facebookId = profile.id;
    const email = profile.emails?.[0]?.value;
    const fullName = profile.displayName;

    // 1. Tìm theo facebookId
    let user = await this.userRepo.findOne({ where: { facebookId } });
    if (user) return user;

    // 2. Tìm theo username = email (nếu trước đây có tạo bằng email)
    if (email) {
      user = await this.userRepo.findOne({ where: { username: email } });
      if (user) {
        user.facebookId = facebookId;
        return this.userRepo.save(user);
      }
    }

    // 3. Tạo mới
    const newUser = this.userRepo.create({
      facebookId,
      username: email || `facebook:${facebookId}`,
      fullName: fullName || 'Người dùng Facebook',
      password: facebookId, // không dùng mật khẩu thật (bắt buộc để match schema)
      isActive: true,
    });

    return this.userRepo.save(newUser);
  }
}
