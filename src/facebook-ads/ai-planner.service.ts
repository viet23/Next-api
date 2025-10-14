import { Injectable } from '@nestjs/common'
import axios from 'axios'

@Injectable()
export class AiPlannerService {
  private async callOpenAIJSON(systemPrompt: string, userPrompt: string) {
    const body = {
      model: 'gpt-4o-mini', // đổi model nếu bạn dùng model khác
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 700,
      response_format: { type: 'json_object' as const },
    }

    const res = await axios.post('https://api.openai.com/v1/chat/completions', body, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    })

    const txt = res?.data?.choices?.[0]?.message?.content || '{}'
    try {
      return JSON.parse(txt)
    } catch {
      return {}
    }
  }

  async suggestPlanFromReport(report: any, currentTargeting: any, campaignObjective?: string) {
    const systemPrompt = `Bạn là trợ lý tối ưu quảng cáo Meta. Chỉ trả JSON theo schema:
{
  "set_auto_placements": boolean?,
  "expand_audience": boolean?,
  "age_range": { "min": number?, "max": number? }?,
  "genders": number[]?, // 1=male, 2=female
  "locales": number[]?,
  "geo": {
    "countries": string[]?,
    "cities": any[]?,
    "regions": any[]?,
    "location_types": string[]?,
    "custom_locations": [{"latitude": number,"longitude": number,"radius": number,"distance_unit":"mile"}]?
  }?,
  "add_interests": [{"id": string,"name": string}]?,
  "add_behaviors": [{"id": string,"name": string}]?,
  "exclusions": any?,
  "budget": { "increase_percent": number?,"set_daily_budget": number? }?,
  "ab_test": {
    "pause_old_ad": boolean?,
    "variants": [{"name": string,"primaryText": string,"imageHash": string?}]?
  }?
}`

    const userPrompt = `Mục tiêu campaign: ${campaignObjective || 'UNKNOWN'}
Báo cáo: ${JSON.stringify(report).slice(0, 6000)}
Targeting hiện tại: ${JSON.stringify(currentTargeting).slice(0, 6000)}
Yêu cầu: chỉ trả JSON hợp lệ theo schema; nếu không chắc thì bỏ field.`

    const plan = await this.callOpenAIJSON(systemPrompt, userPrompt)

    // Sanitize nhẹ
    if (plan?.genders)
      plan.genders = (Array.isArray(plan.genders) ? plan.genders : []).filter((g: any) => g === 1 || g === 2)
    if (plan?.geo?.custom_locations) {
      plan.geo.custom_locations = plan.geo.custom_locations
        .filter((l: any) => Number.isFinite(l?.latitude) && Number.isFinite(l?.longitude) && Number.isFinite(l?.radius))
        .map((l: any) => ({ ...l, distance_unit: 'mile' }))
    }
    if (plan?.add_interests) plan.add_interests = plan.add_interests.filter((i: any) => i?.id && i?.name).slice(0, 10)
    if (plan?.add_behaviors) plan.add_behaviors = plan.add_behaviors.filter((b: any) => b?.id).slice(0, 10)

    return plan || {}
  }
}
