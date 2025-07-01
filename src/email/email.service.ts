import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { CreateEmailDto } from './dto/create-email.dto';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { FacebookAd } from '@models/facebook-ad.entity';
import moment from 'moment-timezone';
import { Repository, Raw, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';


@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  constructor(
    @InjectRepository(FacebookAd)
    private readonly facebookAdRepo: Repository<FacebookAd>
  ) { }

  private transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: '2203viettt@gmail.com',
      pass: 'tpzhvdoemquprhlo',
    },
  });

  async sendFormEmail(data: CreateEmailDto) {
    const { fullName, email, phone, zalo } = data;

    const mailOptions = {
      from: '2203viettt@gmail.com',
      to: 'nextadsai@gmail.com',
      subject: `Yêu cầu hỗ trợ từ ${fullName}`,
      html: `
        <h3>Thông tin người liên hệ:</h3>
        <p><strong>Họ tên:</strong> ${fullName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Zalo:</strong> ${zalo || 'Không cung cấp'}</p>
      `,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Lỗi gửi mail:', error);
      throw new Error('Không thể gửi email');
    }
  }

  @Cron('0 20 * * *') // 🕗 8h tối mỗi ngày
  // @Cron('*/30 * * * * *')
  async reportAdInsights() {
    const today = moment().tz('Asia/Ho_Chi_Minh').startOf('day');
    const tomorrow = moment(today).add(1, 'day');
    const yesterday = moment(today).subtract(1, 'day');
    const since = moment().subtract(1, 'month').format('YYYY-MM-DD');
    const until = moment().format('YYYY-MM-DD');

    this.logger.log(`🔎 Bắt đầu quét dữ liệu quảng cáo lúc ${moment().format('YYYY-MM-DD HH:mm:ss')}`);

    const ads = await this.facebookAdRepo.find({
      where: [
        { startTime: Raw(date => `DATE(${date}) = '${today.format('YYYY-MM-DD')}'`) },
        {
          startTime: LessThanOrEqual(tomorrow.toDate()),
          endTime: MoreThanOrEqual(today.toDate()),
        },
        { endTime: Raw(date => `DATE(${date}) = '${yesterday.format('YYYY-MM-DD')}'`) },
      ],
      relations: ['createdBy'],
    });
    // const ads =[{}]

    // 120228662252270337

    this.logger.log(`📦 Tìm thấy ${ads.length} quảng cáo cần quét.`);

    for (const ad of ads) {
      try {
        const response = await axios.get(`https://graph.facebook.com/v19.0/${ad.adId}/insights`, {
          params: {
            fields: 'impressions,clicks,spend,ctr,cpc,cpm',
            'time_range[since]': since,
            'time_range[until]': until,
            access_token: ad.createdBy?.accessTokenUser,
          },
        });

        const data = response.data?.data?.[0];

        if (data) {
          this.logger.log(`📊 [AdID: ${ad.adId}] - Hiển thị: ${data.impressions}, Click: ${data.clicks}, Chi phí: ${data.spend}đ`);

          // 2. Gọi OpenAI để xin khuyến nghị tối ưu quảng cáo
          let recommendation = "Không có khuyến nghị.";

          try {
            const openaiRes = await axios.post(
              "https://api.openai.com/v1/chat/completions",
              {
                model: "gpt-4",
                messages: [
                  {
                    role: "system",
                    content: "Bạn là chuyên gia quảng cáo Facebook. Chỉ đưa ra 2–3 khuyến nghị ngắn gọn và thực tế nhất để tối ưu quảng cáo dựa trên dữ liệu bên dưới. Không cần giải thích dài dòng, không lan man.",
                  },
                  {
                    role: "user",
                    content: `
Dưới đây là dữ liệu quảng cáo:

- Ad ID: ${ad.adId}
- Chiến dịch: ${ad.campaignName}
- Hiển thị: ${data.impressions}
- Clicks: ${data.clicks}
- Chi phí: ${data.spend} VNĐ
- CTR: ${data.ctr}%
- CPC: ${data.cpc} VNĐ
- CPM: ${data.cpm} VNĐ

Hãy trả lời ngắn gọn , chỉ tập trung vào điều cần cải thiện nhất để hiệu quả tốt hơn.
    `,
                  }
                ],
                temperature: 0.7,
                max_tokens: 900,
              },
              {
                headers: {
                  Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                },
              }
            );

            recommendation = openaiRes.data?.choices?.[0]?.message?.content || recommendation;
            this.logger.log(`🤖 Gợi ý từ AI: ${recommendation}`);
          } catch (aiErr) {
            this.logger.error("⚠️ Lỗi khi gọi OpenAI:", aiErr?.response?.data || aiErr.message);
          }


          // ✅ Gửi mail nếu người tạo có email
          if (ad.createdBy?.email) {
            const htmlReport = `
            <h3>📢 Thống kê quảng cáo</h3>
            <p><strong>Ad ID:</strong> ${ad.adId}</p>
            <p><strong>Chiến dịch:</strong> ${ad.campaignName}</p>
            <p><strong>Người tạo:</strong> ${ad.createdBy.email}</p>
            <p><strong>👁 Hiển thị:</strong> ${data.impressions}</p>
            <p><strong>🖱 Click:</strong> ${data.clicks}</p>
            <p><strong>💸 Chi phí:</strong> ${data.spend} VNĐ</p>
            <p><strong>CTR:</strong> ${data.ctr}% - CPM: ${data.cpm}</p>
            <hr/>
          <h4>📈 Gợi ý tối ưu hóa quảng cáo từ AI:</h4>
          <p>${recommendation.replace(/\n/g, "<br/>")}</p>
          `;

            await this.transporter.sendMail({
              from: '2203viettt@gmail.com',
              to: ad.createdBy.email,
              subject: `📊 Báo cáo quảng cáo #${ad.adId} - ${moment().format('YYYY-MM-DD')}`,
              html: htmlReport,
            });

            this.logger.log(`📤 Đã gửi báo cáo quảng cáo tới: ${ad.createdBy.email}`);
          } else {
            this.logger.warn(`⚠️ Không gửi email vì người tạo quảng cáo không có email.`);
          }
        } else {
          this.logger.warn(`⚠️ Không có dữ liệu insights cho quảng cáo ${ad.adId}`);
        }
      } catch (error: any) {
        this.logger.error(`❌ Lỗi khi lấy dữ liệu cho ad ${ad.adId}: ${error.message}`);
      }
    }

    this.logger.log(`✅ Đã hoàn tất quét dữ liệu quảng cáo.`);
  }

}


