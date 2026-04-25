import { emailVerificationTemplate } from '../../../../src/infrastructure/email/templates/email-verification.template.js';

describe('emailVerificationTemplate', () => {
  const data = {
    email: 'verify@example.com',
    verificationUrl: 'https://app.example.com/verify?token=abc123',
    expiresInMinutes: 60,
  };
  const result = emailVerificationTemplate(data);

  it('returns correct subject', () => {
    expect(result.subject).toBe('Verify your email address');
  });

  it('html contains the verification URL', () => {
    expect(result.html).toContain(data.verificationUrl);
  });

  it('html contains expiry time', () => {
    expect(result.html).toContain('60');
  });

  it('text contains the verification URL', () => {
    expect(result.text).toContain(data.verificationUrl);
  });

  it('text contains expiry time', () => {
    expect(result.text).toContain('60');
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
    const r = emailVerificationTemplate({ ...data, expiresInMinutes: 15 });
    expect(r.html).toContain('15');
    expect(r.text).toContain('15');
  });
});
