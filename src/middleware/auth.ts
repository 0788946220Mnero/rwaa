import { NextFunction, Request, Response } from 'express';
import { Role, PLATFORM_ROLES } from '../shared';
import { verifyAccess } from '../lib/tokens';
import { forbidden, unauthorized } from '../utils/errors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: Role; businessId?: string };
    }
  }
}

/** يقرأ التوكن ويملأ req.user — يرفض الطلب إن كان غير صالح */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized('التوكن مفقود'));
  try {
    const payload = verifyAccess(header.slice(7));
    req.user = { id: payload.sub, role: payload.role, businessId: payload.businessId };
    next();
  } catch {
    next(unauthorized('التوكن غير صالح أو منتهي'));
  }
}

/** يقرأ التوكن إن وُجد دون رفض الطلب — للمسارات العامة التي تتغير حسب المستخدم */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = verifyAccess(header.slice(7));
      req.user = { id: payload.sub, role: payload.role, businessId: payload.businessId };
    } catch { /* تجاهل */ }
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export const requirePlatform = requireRole(...PLATFORM_ROLES);

/**
 * حارس العزل بين المستأجرين (البند 46).
 * أي مسار يحمل :businessId يجب أن يمر من هنا.
 * مدير المنصة يمر، وصاحب النشاط يمر فقط على نشاطه هو.
 */
export function tenantScope(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(unauthorized());
  const target = req.params.businessId;
  if (!target) return next(forbidden('معرّف النشاط مفقود'));
  if (PLATFORM_ROLES.includes(req.user.role)) return next();
  if (req.user.businessId && req.user.businessId === target) return next();
  next(forbidden('لا تملك صلاحية على هذا النشاط'));
}
