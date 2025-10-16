// src/subscriptions/plan-usage.service.ts
import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from '@models/user.entity'
import { UserSubscription } from '@models/user-subscription.entity'
import { FacebookCampaign } from '@models/facebook_campaign.entity'

export type PlanName = 'Free' | 'Starter' | 'Pro' | 'Enterprise'

type PlanRules = {
  maxCampaignsTotal?: number
  maxCampaignsPerPeriod?: number
  maxBudgetPerCampaignMonthly?: number
  features: {
    advancedOptimization: boolean
    abTesting: boolean
    multiPlatform: boolean
    reportFrequency: 'none' | 'weekly' | 'daily'
  }
}

const VND = (n: number) => n

const PLAN_RULES: Record<PlanName, PlanRules> = {
  Free: {
    maxCampaignsTotal: 2,
    maxBudgetPerCampaignMonthly: VND(5_000_000),
    features: { advancedOptimization: false, abTesting: false, multiPlatform: false, reportFrequency: 'none' },
  },
  Starter: {
    maxCampaignsPerPeriod: 3,
    maxBudgetPerCampaignMonthly: VND(10_000_000),
    features: { advancedOptimization: false, abTesting: false, multiPlatform: false, reportFrequency: 'weekly' },
  },
  Pro: {
    features: { advancedOptimization: true, abTesting: true, multiPlatform: true, reportFrequency: 'daily' },
  },
  Enterprise: {
    features: { advancedOptimization: true, abTesting: true, multiPlatform: true, reportFrequency: 'daily' },
  },
}

export type PlanUsageReport = {
  planName: PlanName
  subscriptionWindow: {
    startDate: string
    endDate: string | null
    isPaid: boolean
    isExpired: boolean
    daysRemaining: number | null
    warnings: string[]
  }
  limits: {
    maxCampaignsTotal?: number
    maxCampaignsPerPeriod?: number
    maxBudgetPerCampaignMonthly?: number
  }
  usage: {
    campaignsInPeriod: number
    latestCampaignMonthlyBudget?: number | null
  }
  exhausted: boolean
  violations: string[]
  notes?: string[]
}

@Injectable()
export class PlanUsageService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserSubscription) private readonly userSubRepo: Repository<UserSubscription>,
    @InjectRepository(FacebookCampaign) private readonly fbCampaignRepo: Repository<FacebookCampaign>,
  ) {}

  private coercePlanName(name?: string): PlanName {
    const known: PlanName[] = ['Free', 'Starter', 'Pro', 'Enterprise']
    return (known.includes(name as PlanName) ? name : 'Free') as PlanName
  }

  private async getCurrentPlan(userId: string | number): Promise<{
    name: PlanName
    startDate: Date
    endDate: Date | null
    isPaid: boolean
  }> {
    const sub = await this.userSubRepo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.plan', 'plan')
      .where('sub.userId = :id', { id: userId })
      .orderBy('sub.updatedAt', 'DESC')
      .getOne()

    if (!sub?.plan?.name) throw new NotFoundException('User chưa có gói dịch vụ hợp lệ')

    return {
      name: this.coercePlanName(sub.plan.name),
      startDate: new Date(sub.startDate),
      endDate: sub.endDate ? new Date(sub.endDate) : null,
      isPaid: Boolean(sub.isPaid),
    }
  }

  private async countCampaignsInSubscription(userId: number | string, start: Date, end: Date | null) {
    const qb = this.fbCampaignRepo
      .createQueryBuilder('c')
      .leftJoin('c.createdBy', 'u')
      .where('u.id = :uid', { uid: userId })
      .andWhere('c.createdAt >= :start', { start })

    if (end) qb.andWhere('c.createdAt <= :end', { end })

    return qb.getCount()
  }

  private async getLatestCampaignInSubscription(userId: number | string, start: Date, end: Date | null) {
    const qb = this.fbCampaignRepo
      .createQueryBuilder('c')
      .leftJoin('c.createdBy', 'u')
      .where('u.id = :uid', { uid: userId })
      .andWhere('c.createdAt >= :start', { start })

    if (end) qb.andWhere('c.createdAt <= :end', { end })

    return qb.orderBy('c.createdAt', 'DESC').getOne()
  }

  private getMonthlyBudgetFromCampaign(campaign: any): number | null {
    if (!campaign) return null
    if (typeof campaign.monthlyBudget === 'number') return campaign.monthlyBudget
    if (typeof campaign.budgetMonthly === 'number') return campaign.budgetMonthly
    if (typeof campaign.dailyBudget === 'number') return Math.round(campaign.dailyBudget * 30)
    return null
  }

  private getExpiryInfo(start: Date, end: Date | null) {
    const now = new Date()
    const isExpired = Boolean(end && now > end)
    const daysRemaining = end ? Math.ceil((end.getTime() - now.getTime()) / (24 * 3600 * 1000)) : null
    const warnings: string[] = []

    if (isExpired) warnings.push('Gói đã hết hạn.')
    else if (typeof daysRemaining === 'number' && daysRemaining <= 3) warnings.push(`Gói sắp hết hạn trong ${daysRemaining} ngày.`)

    return { isExpired, daysRemaining, warnings }
  }

  /** Chặn tạo campaign nếu gói hết hạn hoặc chưa thanh toán, hoặc vượt hạn mức */
  async assertCanCreateCampaign(userId: number | string) {
    const plan = await this.getCurrentPlan(userId)
    const rules = PLAN_RULES[plan.name]
    const { isExpired } = this.getExpiryInfo(plan.startDate, plan.endDate)

    if (isExpired) {
      throw new ForbiddenException('Không thể tạo chiến dịch vì gói đã hết hạn.')
    }
    if (!plan.isPaid) {
      throw new ForbiddenException('Không thể tạo chiến dịch vì gói chưa thanh toán.')
    }

    const campaignsInPeriod = await this.countCampaignsInSubscription(userId, plan.startDate, plan.endDate)

    console.log(`campaignsInPeriod`, campaignsInPeriod);
    console.log(`rules`, rules);
    
    

    if (typeof rules.maxCampaignsTotal === 'number' && campaignsInPeriod >= rules.maxCampaignsTotal) {
      throw new ForbiddenException(`Gói ${plan.name} chỉ cho phép tối đa ${rules.maxCampaignsTotal} chiến dịch trong kỳ gói.`)
    }
    if (typeof rules.maxCampaignsPerPeriod === 'number' && campaignsInPeriod >= rules.maxCampaignsPerPeriod) {
      throw new ForbiddenException(`Gói ${plan.name} chỉ cho phép tối đa ${rules.maxCampaignsPerPeriod} chiến dịch trong kỳ gói.`)
    }
    return true
  }

  /** Chặn ngân sách nếu gói hết hạn hoặc chưa thanh toán, hoặc vượt trần */
  async assertBudgetAllowed(userId: number | string, proposedMonthlyBudget: number) {
    const plan = await this.getCurrentPlan(userId)
    const rules = PLAN_RULES[plan.name]
    const { isExpired } = this.getExpiryInfo(plan.startDate, plan.endDate)

    if (isExpired) {
      throw new ForbiddenException('Không thể đặt ngân sách vì gói đã hết hạn.')
    }
    if (!plan.isPaid) {
      throw new ForbiddenException('Không thể đặt ngân sách vì gói chưa thanh toán.')
    }

    if (rules?.maxBudgetPerCampaignMonthly && proposedMonthlyBudget > rules.maxBudgetPerCampaignMonthly) {
      throw new ForbiddenException(
        `Ngân sách/campaign vượt trần gói ${plan.name}: tối đa ${rules.maxBudgetPerCampaignMonthly.toLocaleString('vi-VN')}đ/tháng`,
      )
    }
    return true
  }

  /** Tính năng bị tắt nếu gói hết hạn hoặc chưa thanh toán */
  async hasFeature(userId: number | string, feature: keyof PlanRules['features']): Promise<boolean> {
    const plan = await this.getCurrentPlan(userId)
    const { isExpired } = this.getExpiryInfo(plan.startDate, plan.endDate)
    if (isExpired || !plan.isPaid) return false
    const rules = PLAN_RULES[plan.name]
    return Boolean(rules.features[feature])
  }

  /** Báo cáo tổng quan (đưa isPaid vào violations + exhausted) */
  async evaluateUsage(user: User): Promise<PlanUsageReport> {
    const { name: planName, startDate, endDate, isPaid } = await this.getCurrentPlan(user.id)
    const rules = PLAN_RULES[planName]

    const { isExpired, daysRemaining, warnings } = this.getExpiryInfo(startDate, endDate)

    const campaignsInPeriod = await this.countCampaignsInSubscription(user.id, startDate, endDate)
    const latestCampaign = await this.getLatestCampaignInSubscription(user.id, startDate, endDate)
    const latestBudget = this.getMonthlyBudgetFromCampaign(latestCampaign)

    const violations: string[] = []
    const notes: string[] = []

    if (typeof rules.maxCampaignsTotal === 'number' && campaignsInPeriod > rules.maxCampaignsTotal) {
      violations.push(`Vượt số chiến dịch cho phép trong kỳ gói: ${campaignsInPeriod}/${rules.maxCampaignsTotal}`)
    }
    if (typeof rules.maxCampaignsPerPeriod === 'number' && campaignsInPeriod > rules.maxCampaignsPerPeriod) {
      violations.push(`Vượt số chiến dịch/kỳ gói: ${campaignsInPeriod}/${rules.maxCampaignsPerPeriod}`)
    }
    if (typeof rules.maxBudgetPerCampaignMonthly === 'number' && typeof latestBudget === 'number' && latestBudget > rules.maxBudgetPerCampaignMonthly) {
      violations.push(
        `Ngân sách/campaign gần nhất vượt trần: ${latestBudget.toLocaleString('vi-VN')}đ > ${rules.maxBudgetPerCampaignMonthly.toLocaleString('vi-VN')}đ/tháng`,
      )
    }

    if (!isPaid) {
      violations.push('Gói chưa thanh toán.')
      warnings.push('Gói chưa được đánh dấu đã thanh toán (isPaid = false).')
    }

    if (violations.length) {
      if (planName === 'Free') notes.push('Cân nhắc lên Starter để có 3 chiến dịch/kỳ và trần 10 triệu/campaign.')
      if (planName === 'Starter') notes.push('Cân nhắc lên Pro để bỏ giới hạn chiến dịch & ngân sách/campaign.')
    }
    if (isExpired) {
      notes.push('Gia hạn gói để tiếp tục tạo/duy trì chiến dịch.')
    }

    const exhausted =
      isExpired ||
      !isPaid ||
      violations.length > 0 ||
      (typeof rules.maxCampaignsTotal === 'number' && campaignsInPeriod >= rules.maxCampaignsTotal) ||
      (typeof rules.maxCampaignsPerPeriod === 'number' && campaignsInPeriod >= rules.maxCampaignsPerPeriod)

    return {
      planName,
      subscriptionWindow: {
        startDate: startDate.toISOString(),
        endDate: endDate ? endDate.toISOString() : null,
        isPaid,
        isExpired,
        daysRemaining,
        warnings,
      },
      limits: {
        maxCampaignsTotal: rules.maxCampaignsTotal,
        maxCampaignsPerPeriod: rules.maxCampaignsPerPeriod,
        maxBudgetPerCampaignMonthly: rules.maxBudgetPerCampaignMonthly,
      },
      usage: {
        campaignsInPeriod,
        latestCampaignMonthlyBudget: latestBudget ?? null,
      },
      exhausted,
      violations,
      notes,
    }
  }
}
