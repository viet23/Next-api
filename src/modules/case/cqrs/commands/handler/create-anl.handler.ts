import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateAnalysisFbCommand } from '../impl/create-anl.command';
import { AnalysisFb } from '@models/analysis-fb.entity';
import { User } from '@models/user.entity';

@CommandHandler(CreateAnalysisFbCommand)
export class CreateAnalysisFbCommandHandler implements ICommandHandler<CreateAnalysisFbCommand> {
  constructor(
    @InjectRepository(AnalysisFb) private readonly analysisFbRepo: Repository<AnalysisFb>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // helpers
  private isNonEmptyString(v: any): v is string {
    return typeof v === 'string' && v.trim().length > 0;
  }
  private isNonEmptyArray(v: any): v is any[] {
    return Array.isArray(v) && v.some(item => item != null && String(item).trim() !== '');
  }
  private isNonEmptyObject(v: any): v is Record<string, any> {
    return v != null && typeof v === 'object' && !Array.isArray(v) &&
      Object.values(v).some(val => this.isNonEmptyString(val) || typeof val === 'number');
  }

  async execute(command: CreateAnalysisFbCommand): Promise<AnalysisFb> {
    const { dto, user } = command;

    if (!user?.email) throw new BadRequestException('Thiếu thông tin email người dùng');

    const userData = await this.userRepo.findOne({ where: { email: user.email } });
    if (!userData) throw new NotFoundException('Không tìm thấy người dùng');

    // lấy/khởi tạo bản ghi theo userId
    let analysisFb = await this.analysisFbRepo.findOne({
      where: { userId: userData.id.toString() },
    });
    if (!analysisFb) {
      analysisFb = new AnalysisFb();
      analysisFb.userId = userData.id.toString();
    }

    // gán có điều kiện
    if (this.isNonEmptyString(dto?.urlPage)) {
      analysisFb.urlPage = dto.urlPage.trim();
    }

    if (this.isNonEmptyString(dto?.channelPlan)) {
      analysisFb.channelPlan = dto.channelPlan.trim();
    }

    if (this.isNonEmptyArray(dto?.targeting)) {
      analysisFb.targeting = dto.targeting
        .map(x => (x == null ? '' : String(x).trim()))
        .filter(x => x.length > 0);
    }

    if (this.isNonEmptyString(dto?.styleImage)) {
      analysisFb.styleImage = dto.styleImage.trim();
    }

    // merge analysis theo key con không rỗng
    if (this.isNonEmptyObject(dto?.analysis)) {
      const cleanAnalysis = Object.fromEntries(
        Object.entries(dto.analysis).filter(([, v]) => this.isNonEmptyString(v))
      );
      if (Object.keys(cleanAnalysis).length > 0) {
        analysisFb.analysis = {
          ...(analysisFb.analysis ?? {}),
          ...cleanAnalysis,
        };
      }
    }

    // đảm bảo userId đúng user hiện tại
    analysisFb.userId = userData.id.toString();

    return await this.analysisFbRepo.save(analysisFb);
  }
}
