import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { CreateEmailDto } from './dto/create-email.dto';

@Injectable()
export class EmailService {
    private transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: '2203viettt@gmail.com', // thay bằng email thật
            pass: 'tpzhvdoemquprhlo',
        },
    });

    //  ` tpzh vdoe mqup rhlo`

    async sendFormEmail(data: CreateEmailDto) {
        const { fullName, email, phone, zalo } = data;

        const mailOptions = {
            from: '2203viettt@gmail.com',
            to: 'nextadsai@gmail.com', // email nhận form
            subject: `Yêu cầu hỗ trợ từ ${fullName}`,
            html: `
        <h3>Thông tin người liên hệ:</h3>
        <p><strong>Họ tên:</strong> ${fullName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Zalo:</strong> ${zalo || 'Không cung cấp'}</p>
      `,
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Lỗi gửi mail:', error);
            throw new Error('Không thể gửi email');
        }
    }
}
