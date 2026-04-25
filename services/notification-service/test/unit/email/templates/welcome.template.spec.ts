import { welcomeTemplate } from '../../../../src/infrastructure/email/templates/welcome.template.js';

describe('welcomeTemplate', () => {
  const result = welcomeTemplate({ email: 'user@example.com' });

  it('returns correct subject', () => {
    expect(result.subject).toBe('Welcome to SSZ Platform');
  });

  it('html includes the recipient email', () => {
    expect(result.html).toContain('user@example.com');
  });

  it('html contains welcome heading', () => {
    expect(result.html).toContain('Welcome to SSZ Platform');
  });

  it('text contains welcome message', () => {
    expect(result.text).toContain('Welcome to SSZ Platform');
  });

  it('text does not contain html tags', () => {
    expect(result.text).not.toMatch(/<[^>]+>/);
  });

  it('returns all three required fields', () => {
    expect(result).toHaveProperty('subject');
    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('text');
  });
});
