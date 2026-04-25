export interface EmailVerificationTemplateData {
  email: string;
  verificationUrl: string;
  expiresInMinutes: number;
}

export function emailVerificationTemplate(
  data: EmailVerificationTemplateData,
): { subject: string; html: string; text: string } {
  return {
    subject: 'Verify your email address',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Verify your email address</h1>
        <p>Click the button below to verify your email address. This link expires in ${data.expiresInMinutes} minutes.</p>
        <p>
          <a href="${data.verificationUrl}"
             style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;">
            Verify Email
          </a>
        </p>
        <p>Or copy this link into your browser:</p>
        <p style="word-break:break-all;color:#4F46E5;">${data.verificationUrl}</p>
        <hr/>
        <p style="color:#888;font-size:12px;">If you did not create an account, you can ignore this email.</p>
      </div>
    `,
    text: `Verify your email address\n\nClick the link below (expires in ${data.expiresInMinutes} minutes):\n${data.verificationUrl}\n\nIf you did not create an account, you can ignore this email.`,
  };
}
