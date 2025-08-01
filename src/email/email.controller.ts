import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { EmailService } from './email.service'
import { CreateEmailDto } from './dto/create-email.dto'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@modules/auth/jwt-auth.guard'
import { Authen } from '@decorators/authen.decorator'
import { User } from '@models/user.entity'

@ApiTags('email')
@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('send-form')
  async sendForm(@Body() body: CreateEmailDto) {
    console.log(`body-------------`, body)

    return this.emailService.sendFormEmail(body)
  }

   @Post('send-credits')
     @UseGuards(JwtAuthGuard)
  async sendCredits(@Body() body: any,  @Authen() user: User) {
    console.log(`body-------------`, body)

    return this.emailService.sendCredits(body , user)
  }

  //  @Post()
  //   @UseGuards(JwtAuthGuard)
  //   // @Roles(RoleEnum.CREATE_CASE)
  //   @ApiBody({ type: CaseDTO })
  //   async creates(@Body() creates: CaseDTO, @Authen() user: User): Promise<any> {
  //     return this.commandBus.execute(new CreateCaseCommand(creates, user))
  //   }
}
