export interface TutoringInvitationTemplateData {
  tutorName: string;
  invitationUrl: string;
  expiresAt: string;
}

export function tutoringInvitationTemplate(data: TutoringInvitationTemplateData): { subject: string; html: string; text: string } {
  const expiryDate = new Date(data.expiresAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return {
    subject: `${data.tutorName} invited you to learn together`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>You've been invited</h1>
        <p>${data.tutorName} has invited you to join their lessons.</p>
        <p style="margin: 32px 0;">
          <a href="${data.invitationUrl}"
             style="background-color: #4F46E5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Accept Invitation
          </a>
        </p>
        <p style="color: #6B7280; font-size: 14px;">This invitation expires on ${expiryDate}.</p>
        <p style="color: #6B7280; font-size: 14px;">
          If the button above doesn't work, copy and paste this link into your browser:<br/>
          <a href="${data.invitationUrl}" style="color: #4F46E5;">${data.invitationUrl}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;"/>
        <p style="color: #9CA3AF; font-size: 12px;">
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
      </div>
    `,
    text: `You've been invited\n\n${data.tutorName} has invited you to join their lessons.\n\nAccept your invitation here:\n${data.invitationUrl}\n\nThis invitation expires on ${expiryDate}.\n\nIf you didn't expect this invitation, you can safely ignore this email.`,
  };
}
