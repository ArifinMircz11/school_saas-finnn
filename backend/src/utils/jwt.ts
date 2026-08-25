import jwt from 'jsonwebtoken';
import config from '../config';

export interface AccessPayload {
  sub: string;
  schoolId: string | null;
  roles: string[];
  permissions: string[];
  type: 'access';
}

export interface RefreshPayload {
  sub: string;
  type: 'refresh';
}

export function signAccessToken(payload: {
  sub: string;
  schoolId: string | null;
  roles: string[];
  permissions: string[];
}): string {
  return jwt.sign(
    { ...payload, type: 'access' },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessTtl as jwt.SignOptions['expiresIn'], issuer: config.jwt.issuer }
  );
}

export function signRefreshToken(sub: string): string {
  return jwt.sign(
    { sub, type: 'refresh' },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshTtl as jwt.SignOptions['expiresIn'], issuer: config.jwt.issuer }
  );
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, config.jwt.accessSecret, { issuer: config.jwt.issuer }) as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  const payload = jwt.verify(token, config.jwt.refreshSecret, {
    issuer: config.jwt.issuer,
  }) as RefreshPayload;
  if (payload.type !== 'refresh') throw new Error('Invalid token type');
  return payload;
}