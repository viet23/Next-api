import { Injectable, Logger } from '@nestjs/common'
import * as nodemailer from 'nodemailer'
import { CreateEmailDto } from './dto/create-email.dto'
import { Cron } from '@nestjs/schedule'
import axios from 'axios'
import { InjectRepository } from '@nestjs/typeorm'
import { FacebookAd } from '@models/facebook-ad.entity'
import moment from 'moment-timezone'
import { Repository, Raw, LessThanOrEqual, MoreThanOrEqual } from 'typeorm'
import { User } from '@models/user.entity'
import { CreditTransaction } from '@models/credit-ransaction .entity'
import { AdInsight } from '@models/ad-insight.entity'
const formatCurrency = (v) => Number(v).toLocaleString('en-US') // 1,234,567
const format2 = (v) => Number(v).toFixed(2) // 2 chữ số thập phân

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)
  constructor(
    @InjectRepository(AdInsight) private readonly adInsightRepo: Repository<AdInsight>,
    @InjectRepository(CreditTransaction) private readonly creditRepo: Repository<CreditTransaction>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(FacebookAd)
    private readonly facebookAdRepo: Repository<FacebookAd>,
  ) { }

  private transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: '2203viettt@gmail.com',
      pass: 'tpzhvdoemquprhlo',
    },
  })

  async sendMailPassword({ to, subject, html }: { to: string; subject: string; html: string }) {
    console.log(`Sending email to: ${to}, subject: ${subject}`);

    return this.transporter.sendMail({
      from: '2203viettt@gmail.com',
      to,
      subject,
      html,
    });
  }



  async sendCredits(data: any, user: User) {
    // const { fullName, email, phone, zalo } = data
    const userData = await this.userRepo.findOne({ where: { email: user.email } })

    console.log(`data`, data);


    const mailOptions = {
      from: '2203viettt@gmail.com',
      to: 'nextadsai@gmail.com',
      subject: `Đã yêu cầu thanh toán 179k mua 500 credits`,
      html: `
        <h3>Thông tin người liên hệ:</h3>
        <p><strong>Họ tên:</strong> ${userData.fullName}</p>
        <p><strong>Email:</strong> ${userData.email}</p>
        <p><strong>Phone:</strong> ${userData.phone}</p>
        <p><strong>Zalo:</strong> ${userData.zalo || 'Không cung cấp'}</p>
      `,
    }

    try {
      const info = await this.transporter.sendMail(mailOptions)
      const transaction = new CreditTransaction()
      transaction.paymentDate = new Date()
      transaction.amountPaidVnd = data.vnd || 179000
      transaction.creditsPurchased = data.credits || 500
      transaction.code = `${data.vnd}vnd-${data.credits}-credits`
      transaction.updatedById = userData.id.toString() // ID của người yêu cầu thanh toán

      await this.creditRepo.save(transaction)

      return { success: true, messageId: info.messageId }
    } catch (error) {
      console.error('Lỗi gửi mail:', error)
      throw new Error('Không thể gửi email')
    }
  }

  async sendFormEmail(data: CreateEmailDto) {
    const { fullName, email, phone, zalo } = data

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
    }

    try {
      const info = await this.transporter.sendMail(mailOptions)
      return { success: true, messageId: info.messageId }
    } catch (error) {
      console.error('Lỗi gửi mail:', error)
      throw new Error('Không thể gửi email')
    }
  }

  @Cron('0 19 * * *', {
    timeZone: 'Asia/Ho_Chi_Minh', // ⏰ đúng giờ VN
  })
  // @Cron('*/30 * * * * *')
  async reportAdInsights() {
    const today = moment().tz('Asia/Ho_Chi_Minh').startOf('day')
    const tomorrow = moment(today).add(1, 'day')
    const yesterday = moment(today).subtract(1, 'day')
    // const since = moment().subtract(1, 'month').format('YYYY-MM-DD')
    // const until = moment().format('YYYY-MM-DD')

    this.logger.log(`🔎 Bắt đầu quét dữ liệu quảng cáo lúc ${moment().format('YYYY-MM-DD HH:mm:ss')}`)

    const ads = await this.facebookAdRepo.find({
      where: [
        { startTime: Raw((date) => `DATE(${date}) = '${today.format('YYYY-MM-DD')}'`) },
        {
          startTime: LessThanOrEqual(tomorrow.toDate()),
          endTime: MoreThanOrEqual(today.toDate()),
        },
        { endTime: Raw((date) => `DATE(${date}) = '${yesterday.format('YYYY-MM-DD')}'`) },
      ],
      relations: ['createdBy'],
    })

    this.logger.log(`📦 Tìm thấy ${ads.length} quảng cáo cần quét.`)

    for (const ad of ads) {
      try {
        const response = await axios.get(`https://graph.facebook.com/v19.0/${ad.adId}/insights`, {
          params: {
            fields: [
              'date_start',
              'date_stop',
              'impressions',
              'reach',
              'frequency',
              'spend',
              'cpm',
              'cpc',
              'ctr',
              'clicks',
              'inline_link_clicks',
              'actions',
              'action_values',
              'video_avg_time_watched_actions',
              'purchase_roas'
            ].join(',')
            ,
            date_preset: 'maximum',
            access_token: ad.createdBy?.accessTokenUser,
          },
        });


        const data = response.data?.data?.[0]

        if (data) {
          this.logger.log(
            `📊 [AdID: ${ad.adId}] - Hiển thị: ${data.impressions}, Click: ${data.clicks}, Chi phí: ${data.spend}đ`,
          )
          const spend = formatCurrency(data.spend)
          const ctr = format2(data.ctr)
          const cpm = formatCurrency(format2(data.cpm))
          let recommendation = 'Không có khuyến nghị.'

          try {
            const openaiRes = await axios.post(
              'https://api.openai.com/v1/chat/completions',
              {
                model: 'gpt-4',
                messages: [
                  {
                    role: 'system',
                    content:
                      'Bạn là chuyên gia quảng cáo Facebook. Chỉ đưa ra 2–3 khuyến nghị ngắn gọn và thực tế nhất để tối ưu quảng cáo dựa trên dữ liệu bên dưới. Không cần giải thích dài dòng, không lan man.',
                  },
                  {
                    role: 'user',
                    content: `
Dưới đây là dữ liệu quảng cáo:

- Ad ID: ${ad.adId}
- Chiến dịch: ${ad.campaignName}
- Hiển thị: ${data.impressions}
- Clicks: ${data.clicks}
- Chi phí: ${spend} VNĐ
- CTR: ${ctr}%
- CPM: ${cpm} VNĐ

Hãy trả lời ngắn gọn , chỉ tập trung vào điều cần cải thiện nhất để hiệu quả tốt hơn.
    `,
                  },
                ],
                temperature: 0.7,
                max_tokens: 900,
              },
              {
                headers: {
                  Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                },
              },
            )

            recommendation = openaiRes.data?.choices?.[0]?.message?.content || recommendation
            this.logger.log(`🤖 Gợi ý từ AI: ${recommendation}`)
          } catch (aiErr) {
            this.logger.error('⚠️ Lỗi khi gọi OpenAI:', aiErr?.response?.data || aiErr.message)
          }

          // ✅ Gửi mail nếu người tạo có email
          if (ad.createdBy?.email) {
            const actions = data?.actions || [];
            const spend = parseFloat(data?.spend || 0).toLocaleString("vi-VN");
            const ctr = parseFloat(data?.ctr || 0).toFixed(2);
            const cpm = parseFloat(data?.cpm || 0).toLocaleString("vi-VN");
            const cpc = parseFloat(data?.cpc || 0).toLocaleString("vi-VN");
            const frequency = parseFloat(data?.frequency || 0).toFixed(2);
            const reach = parseInt(data?.reach || 0).toLocaleString("vi-VN");

            // Map tên action_type sang mô tả tiếng Việt
            const actionTypeMap: Record<string, string> = {
              post_engagement: "Tương tác với bài viết",
              page_engagement: "Tương tác với trang",
              photo_view: "Lượt xem ảnh",
              like: "Lượt thích",
              comment: "Bình luận",
              share: "Chia sẻ",
              link_click: "Click vào liên kết",
              offsite_conversion: "Chuyển đổi ngoài nền tảng",
            };

            // Các loại tương tác cần tính tổng
            const engagementTypes = Object.keys(actionTypeMap);

            // Tính tổng tương tác và hiển thị chi tiết
            let totalEngagement = 0;
            const engagementDetails = actions
              .filter(a => engagementTypes.includes(a.action_type))
              .map(a => {
                const label = actionTypeMap[a.action_type] || a.action_type;
                const value = parseInt(a.value);
                totalEngagement += value;
                return `<li>${label}: ${value}</li>`;
              }).join("");


            // HTML Report
            const htmlReport = `
  <h3>📢 Thống kê quảng cáo</h3>
  <p><strong>Ad ID:</strong> ${ad.adId}</p>
  <p><strong>Chiến dịch:</strong> ${ad.campaignName}</p>
  <p><strong>Người tạo:</strong> ${ad.createdBy.email}</p>
  <p><strong>👁 Hiển thị:</strong> ${data.impressions}</p>
  <p><strong>🙋‍♂️ Reach:</strong> ${reach}</p>
  <p><strong>🔁 Tần suất:</strong> ${frequency}</p>
  <p><strong>🖱 Click:</strong> ${data.clicks}</p>
  <p><strong>🔗 Link Click:</strong> ${data.inline_link_clicks || 0}</p>
  <p><strong>💸 Chi phí:</strong> ${spend} VNĐ</p>
  <p><strong>📊 CTR:</strong> ${ctr}% - CPM: ${cpm} VNĐ - CPC: ${cpc} VNĐ</p>
  <p><strong>📌 Tổng tương tác:</strong> ${totalEngagement}</p>
  <ul>${engagementDetails}</ul>
  <hr/>
  <h4>📈 Gợi ý tối ưu hóa quảng cáo từ AI:</h4>
  <p>${recommendation.replace(/\n/g, '<br/>')}</p>
`;





            await this.transporter.sendMail({
              from: '2203viettt@gmail.com',
              to: ad.createdBy.email,
              subject: `📊 Báo cáo quảng cáo #${ad.adId} - ${moment().format('YYYY-MM-DD')}`,
              html: htmlReport,
            })

            // 🔹 SAVE TO DB — mọi field đều là string
            try {
              await this.adInsightRepo.save({
                adId: String(ad.adId),
                campaignName: ad.campaignName ? String(ad.campaignName) : null,
                createdByEmail: ad.createdBy?.email ? String(ad.createdBy.email) : null,

                impressions: String(data.impressions ?? '0'),
                reach: String(data.reach ?? '0'),
                frequency: String(data.frequency ?? '0'),
                clicks: String(data.clicks ?? '0'),
                inlineLinkClicks: String(data.inline_link_clicks ?? '0'),
                spendVnd: String(data.spend ?? '0'),
                ctrPercent: String(data.ctr ?? '0'),
                cpmVnd: String(data.cpm ?? '0'),
                cpcVnd: String(data.cpc ?? '0'),

                totalEngagement: String(totalEngagement),
                engagementDetails: String(engagementDetails || ''), // nếu muốn JSON thì đổi sang JSON.stringify(...)
                recommendation: recommendation ? String(recommendation) : null,
                htmlReport: String(htmlReport || ''),

                userId: ad.createdBy?.id ? String(ad.createdBy.id) : null,
              })
              this.logger.log(`💾 Đã lưu insight vào DB cho ad ${ad.adId}`)
            } catch (saveErr: any) {
              this.logger.error(`❗️ Lỗi lưu DB ad ${ad.adId}: ${saveErr.message}`, saveErr?.stack)
            }

            this.logger.log(`📤 Đã gửi báo cáo quảng cáo tới: ${ad.createdBy.email}`)
          } else {
            this.logger.warn(`⚠️ Không gửi email vì người tạo quảng cáo không có email.`)
          }
        } else {
          this.logger.warn(`⚠️ Không có dữ liệu insights cho quảng cáo ${ad.adId}`)
        }
      } catch (error: any) {
        this.logger.error(`❌ Lỗi khi lấy dữ liệu cho ad ${ad.adId}: ${error.message}`)
      }
    }

    this.logger.log(`✅ Đã hoàn tất quét dữ liệu quảng cáo.`)
  }
}
