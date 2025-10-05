import { Injectable } from '@nestjs/common';
import { RegisterTrialDto } from './dto/register-trial.dto';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '@models/user.entity';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User) private readonly userRepo: Repository<User>
    ) { }
    async registerTrial(data: RegisterTrialDto) {
        // Ví dụ: gọi API ngoài hoặc lưu vào DB
        // Ở đây mình mock lại response

        console.log('Registering trial account with data:', data);
        let user = await this.userRepo
            .createQueryBuilder()
            .where('email =:email', { email: data.email })
            .getOne()

        const saved = await this.userRepo.save(user)

        if (!user) {
            user = new User()
            user.username = data.fullName
            user.fullName = data.fullName
            user.password = "Ads@123456" // Mật khẩu mặc định cho tài khoản thử nghiệm
            user.email = data.email
            user.phone = data.phone
            const saved = await this.userRepo.save(user)
            console.log('saved', saved);

        }

        if (user && (!user.phone || user.phone.length == 0)) {
            user.phone = data.phone
            await this.userRepo.save(user)
        }

        return {
            success: true,
            message: 'Trial account registered successfully',
            data,
        };
    }
}
