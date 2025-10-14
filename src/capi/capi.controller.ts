import { Body, Controller, Headers, Ip, Post, Req, UsePipes, ValidationPipe } from '@nestjs/common'
import { CapiService } from './capi.service'
import { CapiEventDto } from './dto/capi-event.dto'
import { Request } from 'express'
import { ApiTags } from '@nestjs/swagger'

@ApiTags('capi-events')
@Controller('capi-events')
export class CapiController {
  constructor(private readonly capi: CapiService) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async ingest(@Body() body: CapiEventDto, @Ip() ip: string, @Headers('user-agent') ua: string, @Req() req: Request) {
    // Ưu tiên x-forwarded-for nếu có (deploy sau proxy)
    const xfwd = (req.headers['x-forwarded-for'] as string) || ''
    const clientIp = xfwd.split(',')[0]?.trim() || ip || (req.socket as any)?.remoteAddress

    return this.capi.sendToMeta({
      body,
      clientIp,
      userAgent: ua,
    })
  }
}
