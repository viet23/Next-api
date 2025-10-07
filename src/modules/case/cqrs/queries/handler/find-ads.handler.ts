import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { FindAdsQuery } from '../impl/find-ads.query';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import moment from 'moment-timezone';
import * as crypto from 'crypto';
import axios from 'axios';
import { FacebookAd } from '@models/facebook-ad.entity';
import { AdInsight } from '@models/ad-insight.entity';

@QueryHandler(FindAdsQuery)
export class FindAdsQueryHandler implements IQueryHandler<FindAdsQuery> {
  private readonly logger = new Logger(FindAdsQueryHandler.name);

  constructor(
    @InjectRepository(FacebookAd)
    private readonly facebookAdRepo: Repository<FacebookAd>,

    @InjectRepository(AdInsight)
    private readonly adInsightRepo: Repository<AdInsight>,
  ) { }

  async execute(query: FindAdsQuery): Promise<any> {
    const { id, user } = query;
    this.logger.log(`🔍 Bắt đầu lấy dữ liệu quảng cáo cho adId=${id}`);

    const ad = await this.facebookAdRepo.findOne({
      where: { adId: id, createdBy: { email: user.email } },
      relations: ['createdBy'],
    });

    if (!ad) {
      this.logger.warn(`⚠️ Không tìm thấy quảng cáo có adId=${id} của user=${user.email}`);
      return null;
    }

    const { startTime, endTime } = ad;
    const start = moment(startTime).startOf('day');
    const end = moment(endTime).endOf('day');

    // --- Lấy các bản ghi đã có trong khoảng thời gian ---
    const existingInsights = await this.adInsightRepo.find({
      where: { adId: id },
      order: { createdAt: 'ASC' },
    });

    const existingDates = existingInsights.map(i =>
      moment(i.createdAt).format('YYYY-MM-DD'),
    );

    // --- Danh sách ngày cần có ---
    const allDates: string[] = [];
    let cursor = start.clone();
    while (cursor.isSameOrBefore(end)) {
      allDates.push(cursor.format('YYYY-MM-DD'));
      cursor.add(1, 'day');
    }

    // --- Ngày thiếu ---
    const missingDates = allDates.filter(d => !existingDates.includes(d));

    if (missingDates.length === 0) {
      this.logger.log(`✅ Đã có đủ báo cáo từ ${start.format('YYYY-MM-DD')} → ${end.format('YYYY-MM-DD')}`);
      return existingInsights;
    }

    this.logger.log(`🧩 Còn thiếu ${missingDates.length} ngày: ${missingDates.join(', ')}`);

    // ====== Cấu hình Facebook API ======
    const token = ad.createdBy?.accessTokenUser;
    const rawCookie = ad.createdBy?.cookie;
    const appsecret = process.env.FB_APP_SECRET;

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (rawCookie) headers.Cookie = rawCookie;
    if (token) headers.Authorization = `Bearer ${token}`;

    const appsecret_proof =
      token && appsecret
        ? crypto.createHmac('sha256', appsecret).update(token).digest('hex')
        : undefined;

    // ====== Vòng lặp lấy dữ liệu từng ngày ======
    for (const date of missingDates) {
      try {
        const dateStart = moment(date).startOf('day');
        const dateStop = moment(date).endOf('day');

        const fbRes = await axios.get(`https://graph.facebook.com/v19.0/${id}/insights`, {
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
              'purchase_roas',
            ].join(','),
            time_range: JSON.stringify({
              since: start.format('YYYY-MM-DD'),
              until: dateStop.format('YYYY-MM-DD'),
            }),
            ...(appsecret_proof ? { appsecret_proof } : {}),
          },
          headers,
          timeout: 15000,
        });

        const data = fbRes.data?.data?.[0];
        if (!data) {
          this.logger.warn(`⚠️ Không có dữ liệu insights cho ngày ${date}`);
          continue;
        }

        // ====== Chuẩn hoá dữ liệu ======
        const toNum = (v: any, def = 0) => (Number.isFinite(+v) ? +v : def);
        const vnd = (v: any) => toNum(v).toLocaleString('vi-VN', { maximumFractionDigits: 0 });
        const pct = (v: any, digits = 2) => toNum(v).toFixed(digits);
        const int = (v: any) => Math.round(toNum(v)).toLocaleString('vi-VN');

        const impressions = toNum(data.impressions);
        const reach = toNum(data.reach);
        const frequency = toNum(data.frequency);
        const clicks = toNum(data.clicks);
        const inlineLinkClicks = toNum(data.inline_link_clicks);
        const spend = toNum(data.spend);
        const ctr = toNum(data.ctr);
        const cpm = toNum(data.cpm);
        const cpc = toNum(data.cpc);

        // ====== Tương tác ======
        const actions = Array.isArray(data?.actions) ? data.actions : [];
        const actionTypeMap: Record<string, string> = {
          like: 'Lượt thích',
          comment: 'Bình luận',
          share: 'Chia sẻ',
          link_click: 'Click vào liên kết',
          purchase: 'Mua hàng',
        };
        let totalEngagement = 0;
        const engagementItems = actions
          .filter((a) => Object.keys(actionTypeMap).includes(a.action_type))
          .map((a) => {
            const label = actionTypeMap[a.action_type];
            const value = toNum(a.value);
            totalEngagement += value;
            return { label, value };
          });

        // ====== HTML Report ======
        const htmlReport = `
      <h3>📅 Báo cáo ngày ${dateStart.format('DD/MM/YYYY')}</h3>
      <p><strong>Ad ID:</strong> ${ad.adId}</p>
      <p><strong>Chiến dịch:</strong> ${ad.campaignName || ''}</p>
      <p><strong>Người tạo:</strong> ${ad.createdBy?.email || ''}</p>
      <p><strong>👁 Hiển thị:</strong> ${int(impressions)}</p>
      <p><strong>🙋‍♂️ Reach:</strong> ${int(reach)}</p>
      <p><strong>🔁 Tần suất:</strong> ${pct(frequency)}</p>
      <p><strong>🖱 Click:</strong> ${int(clicks)}</p>
      <p><strong>🔗 Link Click:</strong> ${int(inlineLinkClicks)}</p>
      <p><strong>💸 Chi phí:</strong> ${vnd(spend)} VNĐ</p>
      <p><strong>📊 CTR:</strong> ${pct(ctr)}% &nbsp;•&nbsp; CPM: ${vnd(cpm)} VNĐ &nbsp;•&nbsp; CPC: ${vnd(cpc)} VNĐ</p>
      <p><strong>📌 Tổng tương tác:</strong> ${int(totalEngagement)}</p>
      ${engagementItems.length
            ? `<ul>${engagementItems.map(e => `<li>${e.label}: ${int(e.value)}</li>`).join('')}</ul>`
            : ''
          }
    `;

        // ====== Kiểm tra xem ngày này đã có trong DB chưa ======
        const existingInsight = await this.adInsightRepo.findOne({
          where: {
            adId: String(id),
            createdAt: dateStart.startOf('day').toDate(),
          },
        });

        if (existingInsight) {
          // ====== Cập nhật ======
          Object.assign(existingInsight, {
            impressions: String(impressions),
            reach: String(reach),
            frequency: String(frequency),
            clicks: String(clicks),
            inlineLinkClicks: String(inlineLinkClicks),
            spendVnd: String(spend),
            ctrPercent: pct(ctr),
            cpmVnd: vnd(cpm),
            cpcVnd: vnd(cpc),
            totalEngagement: String(totalEngagement),
            engagementDetails: JSON.stringify(engagementItems),
            htmlReport,
            updatedAt: new Date(),
          });

          await this.adInsightRepo.save(existingInsight);
          this.logger.log(`♻️ Đã cập nhật báo cáo ngày ${dateStart.format('DD/MM/YYYY')} cho ad ${id}`);
        } else {
          const existing = await this.adInsightRepo
            .createQueryBuilder('insight')
            .where('insight.adId = :adId', { adId: String(id) })
            .andWhere('insight.htmlReport LIKE :dateStr', { dateStr: `%${dateStart.format('DD/MM/YYYY')}%` })
            .getOne();

          if (existing) {
            this.logger.log(`⚠️ Báo cáo ngày ${dateStart.format('DD/MM/YYYY')} cho ad ${id} đã tồn tại, bỏ qua.`);
            continue;
          }
          // ====== Tạo mới ======
          const newInsight = this.adInsightRepo.create({
            adId: String(id),
            campaignName: ad.campaignName,
            createdByEmail: ad.createdBy?.email || null,
            impressions: String(impressions),
            reach: String(reach),
            frequency: String(frequency),
            clicks: String(clicks),
            inlineLinkClicks: String(inlineLinkClicks),
            spendVnd: String(spend),
            ctrPercent: pct(ctr),
            cpmVnd: vnd(cpm),
            cpcVnd: vnd(cpc),
            totalEngagement: String(totalEngagement),
            engagementDetails: JSON.stringify(engagementItems),
            htmlReport,
            userId: String(ad.createdBy?.id),
            createdAt: dateStart.startOf('day').toDate(),
            updatedAt: new Date(),
          });

          await this.adInsightRepo.save(newInsight);
          this.logger.log(`💾 Đã lưu báo cáo ngày ${dateStart.format('DD/MM/YYYY')} cho ad ${id}`);
        }
      } catch (err: any) {
        this.logger.error(`❌ Lỗi khi lấy báo cáo ngày ${moment(date).format('DD/MM/YYYY')}: ${err.message}`);
      }
    }


    // Sau khi bổ sung, lấy lại tất cả báo cáo
    const finalReports = await this.adInsightRepo
      .createQueryBuilder('adInsight')
      .where('adInsight.adId=:id', { id })
      .orderBy('adInsight.createdAt', 'ASC')
      .getMany();

    this.logger.log(`✅ Hoàn tất đồng bộ ${finalReports.length} bản ghi insight cho ad ${id}`);
    return finalReports;
  }
}
