import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { AnalyzeTargetingDto } from './dto/analyze-targeting.dto'
import { OpenaiService } from './openai.service'
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard'
import { Authen } from '@decorators/authen.decorator'
import { User } from '@models/user.entity'

@Controller('openai')
export class OpenaiController {
  constructor(private readonly aiService: OpenaiService) {}

  /** 🟢 API phân tích targeting */
  @Post('analyze-targeting')
  @UseGuards(JwtAuthGuard)
  async analyze(@Body() dto: AnalyzeTargetingDto, @Authen() user: User) {
    return this.aiService.analyzeTargeting(dto.prompt, user)
  }

  /** 🟢 API rewrite content */
  @Post('rewrite')
  async rewrite(@Body('prompt') prompt: string) {
    return this.aiService.rewriteText(prompt)
  }

  /** 🟢 API chấm điểm quảng cáo */
  @Post('score-ad')
  async scoreAd(@Body('prompt') prompt: string) {
    return this.aiService.scoreAd(prompt)
  }

  /** 🟢 API sinh nội dung general */
  @Post('generate')
  async generate(@Body('prompt') prompt: string) {
    return this.aiService.generateText(prompt)
  }

  /** 🟢 API simple chat */
  @Post('simple-chat')
  async simpleChat(@Body('prompt') prompt: string) {
    return this.aiService.simpleChat(prompt)
  }

  /** 🟢 API creative chat */
  @Post('creative-chat')
  async creativeChat(@Body('prompt') prompt: string) {
    return this.aiService.creativeChat(prompt)
  }

  @Post('score-caption')
  async scoreCaption(@Body() body: { contentFetchOpportunityScore: string; captionText: string }) {
    return this.aiService.scoreCaptionNumber(body.contentFetchOpportunityScore, body.captionText)
  }

  @Post('translate-expand')
  async translateExpand(@Body() body: { text: string }) {
    return this.aiService.translateAndExpandPrompt(body.text)
  }

  @Post('generate-caption')
  async generateCaption(@Body() body: { contentGenerateCaption: string; description: string }) {
    return this.aiService.generateCaptionFromDescription(body.contentGenerateCaption, body.description)
  }

  @Post('prompt-chat')
  async promptChat(@Body('promptContent') promptContent: string) {
    return this.aiService.chatWithPrompt(promptContent)
  }

  // ----------------------------------------------------------
  // 🟢🟢🟢 API MULTI-TURN CHATWIDGET (GPT-5 Responses API)
  // ----------------------------------------------------------
  @Post('chat-widget')
  async chatWidget(
    @Body()
    body: {
      messages: { role: string; content: string }[]
      previousResponseId?: string | null
    }
  ) {
    return this.aiService.chatWidget(body.messages, body.previousResponseId)
  }
}
