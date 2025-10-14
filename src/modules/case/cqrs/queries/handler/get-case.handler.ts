import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import _ from 'lodash'
import { GetCaseQuery } from '../impl/get-case.query'
import { PaginatedResult } from '@common/interfaces/paginated-result.interface'
import { Case } from '@models/case.entity'
import { User } from '@models/user.entity'
import { ActionType, CaseStatusEnum } from '@common/enums/case.enum'
import axios from 'axios'

// --- Các hàm phụ để gọi lấy url mới ---
async function handleShotstackRender(renderId: string): Promise<string | null> {
  try {
    const response = await axios.get(`https://api.shotstack.io/v1/render/${renderId}`, {
      headers: { 'x-api-key': process.env.SHOTSTACK_API_KEY! },
    })
    return response.data?.url || null
  } catch (error) {
    console.error('❌ Shotstack error:', error?.response?.data || error.message)
    return null
  }
}

async function handleRunwayPolling(taskId: string): Promise<string | null> {
  if (!taskId) return null
  const timeout = Date.now() + 60_000

  while (Date.now() < timeout) {
    await new Promise((r) => setTimeout(r, 2000))
    const taskRes = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': '2024-11-06',
      },
    })
    const taskData = await taskRes.json()
    if (taskData?.status === 'SUCCEEDED') return taskData.output?.[0] || null
    if (['FAILED', 'CANCELLED'].includes(taskData?.status)) return null
  }

  return null
}

async function handleRenderByType(actionType: ActionType, renderId: string): Promise<string | null> {
  if (!renderId) return null
  if (actionType === ActionType.MERGE_MUSIC || actionType === ActionType.MERGE_VIDEO) {
    return await handleShotstackRender(renderId)
  } else {
    return await handleRunwayPolling(renderId)
  }
}

// --- Main QueryHandler ---
@QueryHandler(GetCaseQuery)
export class GetCaseQueryHandler implements IQueryHandler<GetCaseQuery> {
  constructor(
    @InjectRepository(Case) private readonly caseRepo: Repository<Case>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async execute(q: GetCaseQuery): Promise<PaginatedResult<Partial<Case>>> {
    const { filter, user } = q

    const userData = await this.userRepo
      .createQueryBuilder('user')
      .where('user.email = :email', { email: user?.email })
      .getOne()

    const query = this.caseRepo.createQueryBuilder('case')

    // Nếu là PENDING → không lọc theo updatedById
    if (filter?.where?.status !== CaseStatusEnum.PENDING) {
      query.where('case.updatedById = :updatedById', { updatedById: userData?.id })
    }

    query.orderBy('case.createdAt', 'DESC')

    if (filter?.pageSize && filter?.page) {
      const skip = (filter.page - 1) * filter.pageSize
      query.take(filter.pageSize).skip(skip)
    }

    const [data, total] = await query.getManyAndCount()

    // === Bước 1: Gom các item theo taskId để xử lý song song ===
    const taskGroupsMap: Record<string, { action: ActionType; items: Case[] }> = {}

    for (const item of data) {
      if (item.taskId) {
        if (!taskGroupsMap[item.taskId]) {
          taskGroupsMap[item.taskId] = {
            action: item.action as ActionType,
            items: [],
          }
        }
        taskGroupsMap[item.taskId].items.push(item)
      }
    }

    // === Bước 2: Gọi song song để lấy url mới ===
    const taskEntries = Object.entries(taskGroupsMap) // [ [taskId, { action, items }] ]

    const updatedUrls = await Promise.all(
      taskEntries.map(async ([taskId, { action }]) => {
        const url = await handleRenderByType(action, taskId)
        return { taskId, url }
      }),
    )

    // === Bước 3: Gán lại urlVideo nếu lấy được ===
    for (const { taskId, url } of updatedUrls) {
      if (url && taskGroupsMap[taskId]) {
        for (const item of taskGroupsMap[taskId].items) {
          item.urlVideo = url
        }
      }
    }

    return { data, total }
  }
}
