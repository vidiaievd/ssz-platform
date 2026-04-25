import { passwordResetTemplate } from '../../../../src/infrastructure/email/templates/password-reset.template.js';

describe('passwordResetTemplate', () => {
  const data = {
    email: 'user@example.com',
    resetUrl: 'https://app.example.com/reset?token=xyz789',
    expiresInMinutes: 30,
  };
  const result = passwordResetTemplate(data);

  it('returns correct subject', () => {
    expect(result.subject).toBe('Reset your password');
  });

  it('html contains the reset URL', () => {
    expect(result.html).toContain(data.resetUrl);
  });

  it('html contains the recipient email', () => {
    expect(result.html).toContain(data.email);
  });

  it('html contains expiry time', () => {
    expect(result.html).toContain('30');
  });

  it('text contains the reset URL', () => {
    expect(result.text).toContain(data.resetUrl);
  });

  it('text contains expiry time', () => {
    expect(result.text).toContain('30');
  });

  it('text does not contain html tags', () => {
    expect(result.text).not.toMatch(/<[^>]+>/);
  });

  it('returns all three required fields', () => {
    expect(result).toHaveProperty('subject');
    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('text');
  });

  it('different expiry time is reflected', () => {
    const r = passwordResetTemplate({ ...data, expiresInMinutes: 10 });
    expect(r.html).toContain('10');
    expect(r.text).toContain('10');
  });
});
