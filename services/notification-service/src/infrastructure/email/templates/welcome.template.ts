export interface WelcomeTemplateData {
  email: string;
}

export function welcomeTemplate(data: WelcomeTemplateData): { subject: string; html: string; text: string } {
  return {
    subject: 'Welcome to SSZ Platform',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Welcome to SSZ Platform!</h1>
        <p>Your account has been created successfully.</p>
        <p>You can now log in and start learning.</p>
        <p>Happy studying!</p>
        <hr/>
        <p style="color: #888; font-size: 12px;">This email was sent to ${data.email}</p>
      </div>
    `,
    text: `Welcome to SSZ Platform!\n\nYour account has been created successfully.\nYou can now log in and start learning.\n\nHappy studying!`,
  };
}
