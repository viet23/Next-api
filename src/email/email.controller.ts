
import { Body, Controller, Post } from '@nestjs/common';
import { EmailService } from './email.service';
import { CreateEmailDto } from './dto/create-email.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('email')
@Controller('email')
export class EmailController {
    constructor(private readonly emailService: EmailService) { }

    @Post('send-form')
    async sendForm(@Body() body: CreateEmailDto) {
        console.log(`body-------------` , body);
        
        return this.emailService.sendFormEmail(body);
    }
}

