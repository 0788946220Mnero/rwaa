import jwt, { SignOptions } from 'jsonwebtoken';
import { Response } from 'express';
import { env } from '../config/env';
import { Role } from '../shared';

export interface AccessPayload {
  sub: string;
  role: Role;
  businessId?: string;
}
export interface RefreshPayload {
  sub: string;
  tv: number;
}

export const REFRESH_COOKIE = 'rawaa_rt';

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, { expiresIn: env.jwt.accessTtl } as SignOptions);
}

export function signRefreshToken(payload: RefreshPayload): string {
  return jwt.sign(payload, env.jwt.refreshSecret, { expiresIn: env.jwt.refreshTtl } as SignOptions);
}

export const verifyAccess = (t: string) => jwt.verify(t, env.jwt.accessSecret) as AccessPayload;
export const verifyRefresh = (t: string) => jwt.verify(t, env.jwt.refreshSecret) as RefreshPayload;

/**
 * الفرونت إند على Netlify والـ API على Railway = دومينان مختلفان،
 * لذلك الكوكي يحتاج SameSite=None + Secure في الإنتاج.
 */
export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    domain: env.cookieDomain,
    path: '/api/auth',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    domain: env.cookieDomain,
    path: '/api/auth',
  });
}
