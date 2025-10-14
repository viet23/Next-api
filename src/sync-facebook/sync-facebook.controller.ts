import { Controller, Get, Logger, UseGuards } from '@nestjs/common'
import { SyncFacebookService } from './sync-facebook.service'
import { User } from '@models/user.entity'
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard'
import { Authen } from '@decorators/authen.decorator'
import { ApiTags } from '@nestjs/swagger'

@Controller('sync-facebook')
@ApiTags('sync-facebook')
export class SyncFacebookController {
  private readonly logger = new Logger(SyncFacebookController.name)

  constructor(private readonly syncFacebookService: SyncFacebookService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getAccounts(@Authen() user: User): Promise<any> {
    const result = await this.syncFacebookService.getUserAccounts(user)
    return result
  }
}
