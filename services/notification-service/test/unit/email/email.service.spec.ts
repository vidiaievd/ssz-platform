import { EmailService } from '../../../src/infrastructure/email/email.service.js';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

jest.mock('nodemailer', () => ({
  default: {
    createTransport: jest.fn(),
  },
  createTransport: jest.fn(),
}));

const makeConfig = (overrides: object = {}): ConfigService<any> => ({
  get: jest.fn().mockReturnValue({
    host: 'localhost',
    port: 1025,
    secure: false,
    fromAddress: 'noreply@ssz.local',
    fromName: 'SSZ Platform',
    user: undefined,
    pass: undefined,
    ...overrides,
  }),
} as any);

describe('EmailService', () => {
  let service: EmailService;
  let mockSendMail: jest.Mock;
  let mockCreateTransport: jest.Mock;

  beforeEach(() => {
    mockSendMail = jest.fn().mockResolvedValue({ messageId: 'msg-001' });
    mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail });

    (nodemailer as any).createTransport = mockCreateTransport;

    service = new EmailService(makeConfig());
    service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates transport with host, port, and secure flag', () => {
    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'localhost',
      port: 1025,
      secure: false,
    }));
  });

  it('creates transport without auth when user is not configured', () => {
    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({
      auth: undefined,
    }));
  });

  it('creates transport with auth when user is configured', () => {
    mockCreateTransport.mockClear();
    const configWithAuth = makeConfig({ user: 'smtp-user', pass: 'smtp-pass' });
    const svc = new EmailService(configWithAuth);
    svc.onModuleInit();

    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({
      auth: { user: 'smtp-user', pass: 'smtp-pass' },
    }));
  });

  it('sends email with correct from, to, subject, html, and text', async () => {
    await service.send({
      to: 'recipient@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    });

    expect(mockSendMail).toHaveBeenCalledWith({
      from: '"SSZ Platform" <noreply@ssz.local>',
      to: 'recipient@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    });
  });

  it('propagates sendMail errors', async () => {
    mockSendMail.mockRejectedValue(new Error('Connection timeout'));

    await expect(
      service.send({ to: 'x@x.com', subject: 'S', html: '<p/>', text: '' }),
    ).rejects.toThrow('Connection timeout');
  });
});
