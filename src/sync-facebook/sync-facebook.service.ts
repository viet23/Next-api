import { User } from '@models/user.entity'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import axios from 'axios'
import { Repository } from 'typeorm'

@Injectable()
export class SyncFacebookService {
  private readonly logger = new Logger(SyncFacebookService.name)
  private readonly graphVersion = 'v24.0' // dễ đổi khi cần
  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) {}

  async getUserAccounts(user: User): Promise<any> {
    try {
      const existed = await this.userRepo.findOne({ where: { email: user.email } })
      const accessToken = existed?.internalUserAccessToken
      if (!accessToken) {
        this.logger.warn(`User ${user.email} does not have a Facebook User Access Token`)
        return { success: false, error: 'No Facebook User Access Token' }
      }
      const url = `https://graph.facebook.com/${this.graphVersion}/me/accounts`

      const response = await axios.get(url, {
        params: {
          access_token: accessToken,
          debug: 'all',
          format: 'json',
          method: 'get',
          origin_graph_explorer: '1',
          pretty: '0',
          suppress_http_code: '1',
          transport: 'cors',
        },
        headers: {
          accept: '*/*',
          'content-type': 'application/x-www-form-urlencoded',
          // user-agent optional - server side can identify itself
          'user-agent': 'NestJS-FB-Sync-Service',
        },
        timeout: 10000,
      })

      // Nếu Facebook trả về lỗi trong body, axios vẫn trả status 200 trong một số chế độ;
      // Tốt nhất kiểm tra cấu trúc trả về
      const data = response.data

      // Nếu API trả lỗi object { error: { ... } }
      if (data?.error) {
        this.logger.error('Facebook Graph API returned error', JSON.stringify(data.error))
        return { success: false, error: data.error }
      }

      // Chuẩn hóa danh sách pages: id, name, access_token, category, tasks
      const pages = (data?.data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        page_access_token: p.access_token,
        category: p.category,
        tasks: p.tasks,
      }))

      // tìm page có id trùng với existed.idPage (so sánh bằng String để tránh khác kiểu)
      const matchedPage = pages.find((pg) => String(pg.id) === String(existed.idPage))

      // nếu tìm thấy thì lấy token của page đó, không thì để null
      existed.internalPageAccessToken = matchedPage ? matchedPage.page_access_token : null

      // lưu toàn bộ thông tin pages để tham chiếu sau này
      existed.internalPageInformation = pages
      existed.isInternal = true // đánh dấu đã sync facebook

      await this.userRepo.save(existed)

      if (matchedPage) {
        this.logger.log(
          `Fetched ${pages.length} pages for user ${user.email}. Selected page ${matchedPage.id} token saved.`,
        )
      } else {
        this.logger.warn(
          `Fetched ${pages.length} pages for user ${user.email}. No matching page for existed.idPage=${existed.idPage} — internalPageAccessToken set to null.`,
        )
      }

      // trả thêm paging nếu cần
      const paging = data?.paging ?? null

      return { success: true, pages, paging }
    } catch (err: any) {
      // Axios error handling
      const msg = err?.response?.data || err?.message || err
      this.logger.error('Failed to call Facebook Graph API', JSON.stringify(msg))
      return { success: false, error: msg }
    }
  }
}
