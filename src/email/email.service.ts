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

  @Cron('0 9 * * *', {
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
        // 1) Lấy insights từ FB Graph
        const fbRes = await axios.get(`https://graph.facebook.com/v19.0/${ad.adId}/insights`, {
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
            ].join(','),
            date_preset: 'maximum',
            access_token: ad.createdBy?.accessTokenUser,
          },
          timeout: 20000,
        });

        const data = fbRes.data?.data?.[0];
        if (!data) {
          this.logger.warn(`⚠️ Không có dữ liệu insights cho quảng cáo ${ad.adId}`);
          continue;
        }

        // 2) Helper format
        const toNum = (v: any, def = 0) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : def;
        };
        const vnd = (v: any) => toNum(v).toLocaleString('vi-VN');
        const pct = (v: any, digits = 2) => toNum(v).toFixed(digits);
        const int = (v: any) => Math.round(toNum(v)).toLocaleString('vi-VN');

        // Chuẩn dữ liệu
        const impressions = toNum(data.impressions);
        const reach = toNum(data.reach);
        const frequency = toNum(data.frequency);
        const clicks = toNum(data.clicks);
        const inlineLinkClicks = toNum(data.inline_link_clicks);
        const spend = toNum(data.spend);
        const ctr = toNum(data.ctr) * 100; // FB trả CTR theo %, đôi khi đã là %, tùy API. Nếu đã %, bỏ *100.
        const cpm = toNum(data.cpm);
        const cpc = toNum(data.cpc);

        this.logger.log(
          `📊 [AdID: ${ad.adId}] - Hiển thị: ${impressions}, Click: ${clicks}, Chi phí: ${vnd(spend)}đ`
        );

        // 3) Gọi OpenAI → yêu cầu JSON structured
        type AIReturn = {
          danh_gia: { chi_so: string; muc: 'Tốt' | 'Trung bình' | 'Kém'; nhan_xet: string }[];
          tong_quan: string;
          goi_y: string[];
        };

        const systemPrompt = `Bạn là chuyên gia quảng cáo Facebook. 
1) ĐÁNH GIÁ TỪNG CHỈ SỐ theo {Tốt|Trung bình|Kém} với lý do ngắn gọn: Hiển thị (Impressions), Clicks, Chi phí, CTR, CPM.
2) Sau đó, đưa đúng 2–3 khuyến nghị ngắn gọn, thực tế nhất để tối ưu.
YÊU CẦU: Trả về DUY NHẤT JSON theo schema:
{
  "danh_gia": [
    { "chi_so": "Hiển thị", "muc": "Tốt|Trung bình|Kém", "nhan_xet": "..." },
    { "chi_so": "Clicks", "muc": "Tốt|Trung bình|Kém", "nhan_xet": "..." },
    { "chi_so": "Chi phí", "muc": "Tốt|Trung bình|Kém", "nhan_xet": "..." },
    { "chi_so": "CTR", "muc": "Tốt|Trung bình|Kém", "nhan_xet": "..." },
    { "chi_so": "CPM", "muc": "Tốt|Trung bình|Kém", "nhan_xet": "..." }
  ],
  "tong_quan": "1–2 câu tổng hợp",
  "goi_y": ["...", "..."] // 2–3 mục
}
KHÔNG thêm chữ thừa, KHÔNG markdown.`;

        const userPrompt = `
Dưới đây là dữ liệu quảng cáo:

- Ad ID: ${ad.adId}
- Chiến dịch: ${ad.campaignName || ''}
- Hiển thị (Impressions): ${impressions}
- Clicks: ${clicks}
- Chi phí (Spend): ${vnd(spend)} VNĐ
- CTR (%): ${pct(ctr)}
- CPM (VNĐ): ${vnd(cpm)}

Lưu ý:
- Nếu thiếu benchmark, đánh giá tương đối theo mối quan hệ chỉ số (CTR thấp + CPM cao → hiệu quả kém).
- Chỉ đưa tối đa 3 gợi ý có tác động lớn nhất.

Trả về đúng JSON như schema đã nêu.`;

        // Retry đơn giản cho OpenAI
        const callOpenAI = async () => {
          const body: any = {
            model: 'gpt-4',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.2,
            max_tokens: 600,
            // Nếu model hỗ trợ JSON mode: bật để chặn text thừa
            // @ts-ignore
            response_format: { type: 'json_object' },
          };
          return axios.post('https://api.openai.com/v1/chat/completions', body, {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          });
        };

        let aiJson: AIReturn | null = null;
        try {
          let openaiRes;
          try {
            openaiRes = await callOpenAI();
          } catch (e1: any) {
            // Fallback nếu response_format bị từ chối bởi model
            const fallbackBody = {
              model: 'gpt-4',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
              ],
              temperature: 0.2,
              max_tokens: 600,
            };
            openaiRes = await axios.post('https://api.openai.com/v1/chat/completions', fallbackBody, {
              headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
              },
              timeout: 30000,
            });
          }

          const raw = openaiRes.data?.choices?.[0]?.message?.content ?? '{}';
          // Parse an toàn
          const safeSlice = (t: string) => {
            const start = t.indexOf('{');
            const end = t.lastIndexOf('}');
            return start >= 0 && end >= 0 ? t.slice(start, end + 1) : '{}';
          };
          aiJson = JSON.parse(safeSlice(raw));

          // Sắp xếp đánh giá theo ưu tiên: Kém → Trung bình → Tốt
          const priority = { 'Kém': 0, 'Trung bình': 1, 'Tốt': 2 } as const;
          if (Array.isArray(aiJson?.danh_gia)) {
            aiJson!.danh_gia = aiJson!.danh_gia.sort(
              (a, b) => priority[a.muc as keyof typeof priority] - priority[b.muc as keyof typeof priority]
            );
          }
        } catch (aiErr: any) {
          this.logger.error('⚠️ Lỗi khi gọi/parse OpenAI:', aiErr?.response?.data || aiErr.message);
          aiJson = null;
        }

        // 4) Tính tương tác & render
        const actionTypeMap: Record<string, string> = {
          post_engagement: 'Tương tác với bài viết',
          page_engagement: 'Tương tác với trang',
          photo_view: 'Lượt xem ảnh',
          like: 'Lượt thích',
          comment: 'Bình luận',
          share: 'Chia sẻ',
          link_click: 'Click vào liên kết',
          offsite_conversion: 'Chuyển đổi ngoài nền tảng',
          view_content: 'Xem nội dung',
          add_to_cart: 'Thêm vào giỏ',
          purchase: 'Mua hàng',
        };
        const engagementTypes = Object.keys(actionTypeMap);
        const actions = Array.isArray(data?.actions) ? data.actions : [];
        let totalEngagement = 0;
        const engagementItems = actions
          .filter(a => engagementTypes.includes(a.action_type))
          .map(a => {
            const label = actionTypeMap[a.action_type] || a.action_type;
            const value = toNum(a.value);
            totalEngagement += value;
            return { label, value };
          });

        // Render bảng đánh giá & gợi ý (nếu có AI)
        const renderEvalTable = (r: AIReturn | null) => {
          if (!r?.danh_gia?.length) return '<p>Không có đánh giá từ AI.</p>';
          const badge = (muc: string) => {
            switch (muc) {
              case 'Kém': return `<span style="background:#fee2e2;color:#b91c1c;padding:2px 8px;border-radius:999px;font-weight:600;">Kém</span>`;
              case 'Trung bình': return `<span style="background:#fef9c3;color:#a16207;padding:2px 8px;border-radius:999px;font-weight:600;">Trung bình</span>`;
              default: return `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:999px;font-weight:600;">Tốt</span>`;
            }
          };
          const rows = r.danh_gia.map(d =>
            `<tr>
          <td style="padding:8px;border:1px solid #eee;">${d.chi_so}</td>
          <td style="padding:8px;border:1px solid #eee;">${badge(d.muc)}</td>
          <td style="padding:8px;border:1px solid #eee;">${d.nhan_xet}</td>
        </tr>`
          ).join('');
          return `
      <table style="border-collapse:collapse;width:100%;margin-top:6px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="text-align:left;padding:8px;border:1px solid #eee;">Chỉ số</th>
            <th style="text-align:left;padding:8px;border:1px solid #eee;">Mức</th>
            <th style="text-align:left;padding:8px;border:1px solid #eee;">Nhận xét</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
        };

        const renderTips = (r: AIReturn | null) => {
          if (!r?.goi_y?.length) return '<p>Không có gợi ý.</p>';
          const li = r.goi_y.map(g => `<li>${g}</li>`).join('');
          return `<ul style="padding-left:18px;margin:6px 0 0 0;">${li}</ul>`;
        };

        const recommendationStr = aiJson ? JSON.stringify(aiJson) : 'Không có khuyến nghị.';
        // 5) Email HTML – thay vì JSON thô, dùng bảng & bullet
        const htmlReport = `
  <h3>📢 Thống kê quảng cáo</h3>
  <p><strong>Ad ID:</strong> ${ad.adId}</p>
  <p><strong>Chiến dịch:</strong> ${ad.campaignName || ''}</p>
  <p><strong>Người tạo:</strong> ${ad.createdBy?.email || ''}</p>
  <p><strong>👁 Hiển thị:</strong> ${int(impressions)}</p>
  <p><strong>🙋‍♂️ Reach:</strong> ${int(reach)}</p>
  <p><strong>🔁 Tần suất:</strong> ${pct(frequency)}</p>
  <p><strong>🖱 Click:</strong> ${int(clicks)}</p>
  <p><strong>🔗 Link Click:</strong> ${int(inlineLinkClicks)}</p>
  <p><strong>💸 Chi phí:</strong> ${vnd(spend)} VNĐ</p>
  <p><strong>📊 CTR:</strong> ${pct(ctr)}% - CPM: ${vnd(cpm)} VNĐ - CPC: ${vnd(cpc)} VNĐ</p>

  <p><strong>📌 Tổng tương tác:</strong> ${int(totalEngagement)}</p>
  ${engagementItems.length ? `<ul>${engagementItems.map(e => `<li>${e.label}: ${int(e.value)}</li>`).join('')}</ul>` : ''}

  <hr style="margin:16px 0;"/>
  <h4>📈 Đánh giá & Gợi ý tối ưu từ AI</h4>
  ${aiJson?.tong_quan ? `<p><em>${aiJson.tong_quan}</em></p>` : ''}
  ${renderEvalTable(aiJson)}
  <div style="margin-top:8px;"><strong>Gợi ý hành động:</strong>${renderTips(aiJson)}</div>
`;

        // 6) Gửi mail (nếu có email)
        if (ad.createdBy?.email) {
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

        // 7) Lưu DB
        try {
          await this.adInsightRepo.save({
            adId: String(ad.adId),
            campaignName: ad.campaignName ? String(ad.campaignName) : null,
            createdByEmail: ad.createdBy?.email ? String(ad.createdBy.email) : null,

            impressions: String(impressions),
            reach: String(reach),
            frequency: String(frequency),
            clicks: String(clicks),
            inlineLinkClicks: String(inlineLinkClicks),
            spendVnd: String(spend),
            ctrPercent: String(ctr),
            cpmVnd: String(cpm),
            cpcVnd: String(cpc),

            totalEngagement: String(totalEngagement),
            engagementDetails: JSON.stringify(engagementItems), // JSON sạch, dễ dùng lại
            recommendation: recommendationStr, // JSON AI (nếu có) hoặc chuỗi báo không có
            htmlReport: String(htmlReport || ''),

            userId: ad.createdBy?.id ? String(ad.createdBy.id) : null,
          });
          this.logger.log(`💾 Đã lưu insight vào DB cho ad ${ad.adId}`);
        } catch (saveErr: any) {
          this.logger.error(`❗️ Lỗi lưu DB ad ${ad.adId}: ${saveErr.message}`, saveErr?.stack);
        }
      } catch (error: any) {
        this.logger.error(`❌ Lỗi khi lấy dữ liệu cho ad ${ad.adId}: ${error.message}`);
      }
    }


    this.logger.log(`✅ Đã hoàn tất quét dữ liệu quảng cáo.`)
  }
}
