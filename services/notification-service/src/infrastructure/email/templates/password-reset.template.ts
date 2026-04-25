export interface PasswordResetTemplateData {
  email: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export function passwordResetTemplate(
  data: PasswordResetTemplateData,
): { subject: string; html: string; text: string } {
  return {
    subject: 'Reset your password',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Reset your password</h1>
        <p>We received a request to reset the password for your account (${data.email}).</p>
        <p>Click the button below to reset it. This link expires in ${data.expiresInMinutes} minutes.</p>
        <p>
          <a href="${data.resetUrl}"
             style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;">
            Reset Password
          </a>
        </p>
        <p>Or copy this link into your browser:</p>
        <p style="word-break:break-all;color:#4F46E5;">${data.resetUrl}</p>
        <hr/>
        <p style="color:#888;font-size:12px;">If you did not request a password reset, you can ignore this email. Your password will not be changed.</p>
      </div>
    `,
    text: `Reset your password\n\nWe received a request to reset the password for ${data.email}.\nClick the link below (expires in ${data.expiresInMinutes} minutes):\n${data.resetUrl}\n\nIf you did not request this, you can ignore this email.`,
  };
}
