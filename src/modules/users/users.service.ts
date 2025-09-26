import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { User } from 'src/models/user.entity';
import { RoleGroupEnum } from '@common/enums/roles.enum';
import { Group } from '@models/group.entity';
import { UserDataSyncDto } from './dto/user-data-sync.dto';
import { SubscriptionPlan } from '@models/subscription-plan.entity';
import { UserSubscription } from '@models/user-subscription.entity';
import { BuyPlanDto } from './dto/buy-plan.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { EmailService } from 'src/email/email.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Group)
    private readonly groupRepo: Repository<Group>,
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(UserSubscription)
    private readonly userSubRepo: Repository<UserSubscription>,

    private readonly mailerService: EmailService,
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

    // 2. Tìm theo username = email
    if (email) {
      user = await this.userRepo.findOne({ where: { username: email } });
      if (user) {
        return this.userRepo.save(user);
      }
    }

    // 3. Tạo mới
    const newUser = this.userRepo.create({
      username: email || `facebook:${facebookId}`,
      fullName: fullName || 'Người dùng Facebook',
      password: facebookId,
      isActive: true,
    });

    return this.userRepo.save(newUser);
  }

  async findOrCreateFromGoogle(profile: any): Promise<User> {
    let user = await this.userRepo.findOne({ where: { email: profile.email } });

    if (!user) {
      user = new User();
      user.username = profile.email.split('@')[0];
      user.email = profile.email;
      user.fullName = profile.name;
      user.avatar = profile.avatar;
      user.isActive = true;
      user.password = 'Admin@123';
      const checkAdmin = await this.findUserAdmin();
      if (!checkAdmin) user.groups = [await this.findGroupAdmin()];

      await this.userRepo.save(user);
    }

    return user;
  }

  async findUserAdmin() {
    return await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.groups', 'groups')
      .where('groups.name =:name', { name: RoleGroupEnum.ADMIN })
      .getOne();
  }

  async findGroupAdmin() {
    return await this.groupRepo
      .createQueryBuilder('group')
      .where('group.name =:name', { name: RoleGroupEnum.ADMIN })
      .getOne();
  }

  async findByEmail(email: string) {
    return this.userRepo.findOne({ where: { email } });
  }

  async saveResetToken(userId: string, token: string) {
    await this.userRepo.update(userId, {
      resetToken: token,
      resetTokenExpire: new Date(Date.now() + 1000 * 60 * 60), // 1h
    });
  }

  async findByResetToken(token: string) {
    return this.userRepo.findOne({
      where: {
        resetToken: token,
        resetTokenExpire: MoreThan(new Date()),
      },
    });
  }

  async clearResetToken(userId: string) {
    await this.userRepo.update(userId, {
      resetToken: null,
      resetTokenExpire: null,
    });
  }

  async updatePassword(userId: string, hash: string) {
    let user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    user.password = hash;
    await this.userRepo.save(user);
  }

  async updateToken(user: User, dto: UserDataSyncDto) {
    console.log(`UserDataSyncDto`, dto);
    
    let userData = await this.userRepo.findOne({ where: { email: user.email } });
    if (!userData) {
      throw new UnauthorizedException('User not found');
    }

    userData.pageInformation = dto.pageInformation;
    userData.adsInformation = dto.adsInformation;
    userData.cookie = dto.cookie;
    userData.accessTokenUser = dto.accessTokenUser;
    userData.accountAdsId = dto.adsInformation?.[0]?.id || null;

    if (userData.idPage && Array.isArray(dto.pageInformation)) {
      const matchedPage = dto.pageInformation.find(
        (page) => page.idPage === userData.idPage,
      );
      if (matchedPage) {
        userData.accessToken = matchedPage.accessToken;
      }
    }

    return await this.userRepo.save(userData);
  }

  /**
   * 📌 Quản lý gói dịch vụ
   */

  async buyPlan(profile: User, dto: BuyPlanDto) {

    let user = await this.userRepo.findOne({ where: { email: profile.email } });
    if (!user) throw new NotFoundException('user not found');

    const plan = await this.planRepo.findOne({ where: { name: dto.name } });
    if (!plan) throw new NotFoundException('Plan not found');

    const now = new Date();
    const end = new Date();
    end.setMonth(end.getMonth() + dto.months);

    const sub = this.userSubRepo.create({
      user,
      plan,
      startDate: now,
      endDate: end,
      isPaid: false,
    });

    const save =  this.userSubRepo.save(sub);

    await this.mailerService.sendPlan(
      {
        name: dto.name,
        months: dto.months ?? 1,
        startDate: now.toISOString(),
        endDate: end.toISOString(),
      },
      user,
    );

    return save
  }

  async confirmPayment(user: User, dto: ConfirmPaymentDto) {

    const sub = await this.userSubRepo.findOne({
      where: { id: dto.subscriptionId }
    });

    if (sub.isPaid) throw new BadRequestException('Subscription already paid');

    sub.isPaid = true;
    return this.userSubRepo.save(sub);
  }

  async getCurrentPlan(user: User) {
    const sub = await this.userSubRepo.findOne({
      where: { user },
      order: { endDate: 'DESC' },
      relations: ['plan'],
    });

    if (!sub) {
      const freePlan = await this.planRepo.findOne({ where: { name: 'Free' } });
      if (!freePlan) return null;

      const now = new Date();
      const end = new Date();
      end.setDate(end.getDate() + 7);

      const freeSub = this.userSubRepo.create({
        user,
        plan: freePlan,
        startDate: now,
        endDate: end,
        isPaid: true,
      });
      return this.userSubRepo.save(freeSub);
    }

    return sub;
  }
}
