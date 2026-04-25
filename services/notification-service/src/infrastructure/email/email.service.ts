import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { AppConfig } from '../../config/configuration.js';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter!: Transporter;
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(private readonly config: ConfigService<AppConfig>) {
    const emailConfig = this.config.get<AppConfig['email']>('email')!;
    this.fromAddress = emailConfig.fromAddress;
    this.fromName = emailConfig.fromName;
  }

  onModuleInit(): void {
    const emailConfig = this.config.get<AppConfig['email']>('email')!;

    this.transporter = nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      auth: emailConfig.user
        ? { user: emailConfig.user, pass: emailConfig.pass }
        : undefined,
    });

    this.logger.log(`Email transport configured → ${emailConfig.host}:${emailConfig.port}`);
  }

  async send(options: SendEmailOptions): Promise<void> {
    const info = await this.transporter.sendMail({
      from: `"${this.fromName}" <${this.fromAddress}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    this.logger.log(`Email sent to ${options.to} — messageId: ${info.messageId}`);
  }
}
