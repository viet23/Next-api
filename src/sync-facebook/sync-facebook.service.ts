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
    const startTime = Date.now()
    this.logger.debug(`==== START getUserAccounts for user: ${user.email} ====`)
    try {
      this.logger.debug(`Step 1: Fetching user from DB by email=${user.email}`)
      const existed = await this.userRepo.findOne({ where: { email: user.email } })
      if (!existed) {
        this.logger.warn(`User ${user.email} not found in database`)
        return { success: false, error: 'User not found' }
      }

      const accessToken = existed?.internalUserAccessToken
      if (!accessToken) {
        this.logger.warn(`User ${user.email} does not have a Facebook User Access Token`)
        return { success: false, error: 'No Facebook User Access Token' }
      }

      const url = `https://graph.facebook.com/${this.graphVersion}/me/accounts`
      this.logger.debug(`Step 2: Calling Facebook Graph API: ${url}`)

      const params = {
        access_token: accessToken,
        debug: 'all',
        format: 'json',
        method: 'get',
        origin_graph_explorer: '1',
        pretty: '0',
        suppress_http_code: '1',
        transport: 'cors',
      }

      this.logger.verbose(`Request params: ${JSON.stringify(params, null, 2)}`)

      const response = await axios.get(url, {
        params,
        headers: {
          accept: '*/*',
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'NestJS-FB-Sync-Service',
        },
        timeout: 10000,
      })

      this.logger.debug(`Step 3: Received response from Facebook API (status=${response.status})`)
      this.logger.verbose(`Response data: ${JSON.stringify(response.data, null, 2)}`)

      const data = response.data

      // Nếu Facebook trả về lỗi trong body
      if (data?.error) {
        this.logger.error(`Facebook Graph API returned error for user ${user.email}: ${JSON.stringify(data.error)}`)
        return { success: false, error: data.error }
      }

      this.logger.debug('Step 4: Parsing pages data from Facebook response')
      const pages = (data?.data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        page_access_token: p.access_token,
        category: p.category,
        tasks: p.tasks,
      }))

      this.logger.verbose(`Parsed ${pages.length} pages for user ${user.email}`)

      // tìm page có id trùng với existed.idPage
      const matchedPage = pages.find((pg) => String(pg.id) === String(existed.idPage))
      if (matchedPage) {
        this.logger.debug(`Matched page found: ${matchedPage.name} (${matchedPage.id})`)
      } else {
        this.logger.warn(
          `No matching page found for existed.idPage=${existed.idPage}. Will set internalPageAccessToken=null.`,
        )
      }

      existed.internalPageAccessToken = matchedPage ? matchedPage.page_access_token : null
      existed.internalPageInformation = pages
      existed.isInternal = true

      this.logger.debug('Step 5: Saving updated user entity to database...')
      await this.userRepo.save(existed)
      this.logger.debug('User entity updated successfully.')

      if (matchedPage) {
        this.logger.log(
          `Fetched ${pages.length} pages for user ${user.email}. Selected page ${matchedPage.id} token saved.`,
        )
      } else {
        this.logger.warn(
          `Fetched ${pages.length} pages for user ${user.email}. No matching page for existed.idPage=${existed.idPage}.`,
        )
      }

      const paging = data?.paging ?? null
      const duration = Date.now() - startTime
      this.logger.debug(`==== END getUserAccounts (${duration}ms) for user ${user.email} ====`)
      return { success: true, pages, paging }
    } catch (err: any) {
      const msg = err?.response?.data || err?.message || err
      this.logger.error(`Failed to call Facebook Graph API for ${user.email}: ${JSON.stringify(msg)}`)
      return { success: false, error: msg }
    }
  }
}
