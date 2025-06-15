import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/models/user.entity';
import { RoleGroupEnum } from '@common/enums/roles.enum';
import { Group } from '@models/group.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Group) private readonly groupRepo: Repository<Group>,
  ) { }

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
        // user.facebookId = facebookId;
        return this.userRepo.save(user);
      }
    }

    // 3. Tạo mới
    const newUser = this.userRepo.create({
      // facebookId,
      username: email || `facebook:${facebookId}`,
      fullName: fullName || 'Người dùng Facebook',
      password: facebookId, // không dùng mật khẩu thật (bắt buộc để match schema)
      isActive: true,
    });

    return this.userRepo.save(newUser);
  }

  async findOrCreateFromGoogle(profile: any): Promise<User> {
    console.log(`profile`, profile);

    let user = await this.userRepo.findOne({ where: { email: profile.email } });
    console.log(`user`, user);

    if (!user) {
      user = new User();
      user.username = profile.email.split('@')[0]; // fallback username
      user.email = profile.email;
      user.fullName = profile.name;
      user.avatar = profile.avatar; // nếu có field avatar trong User entity
      user.isActive = true;
      user.password = 'Admin@123';
      const checkAdmin = await this.findUserAdmin()
      if (!checkAdmin) user.groups = [await this.findGroupAdmin()]

      await this.userRepo.save(user);
    }

    return user;
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
