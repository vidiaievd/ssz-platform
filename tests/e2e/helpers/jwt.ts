import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';

export interface JwtHelper {
  /** PEM-encoded RSA public key — pass as JWT_PUBLIC_KEY env var to services. */
  publicKey: string;
  /** Sign a token with the matching private key. */
  makeToken(userId: string, roles: string[]): string;
}

export function createJwtHelper(): JwtHelper {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return {
    publicKey,
    makeToken(userId: string, roles: string[]): string {
      return jwt.sign({ roles }, privateKey as jwt.Secret, {
        algorithm: 'RS256',
        subject: userId,
        expiresIn: '1h',
        issuer: 'https://auth.ssz-platform.internal',
        audience: 'ssz-services',
      });
    },
  };
}
