import { Request } from 'express';
import { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog';
import { logger } from '../utils/logger';

interface AuditInput {
  action: string;
  resource: string;
  resourceId?: string;
  before?: unknown;
  after?: unknown;
}

/** تسجيل العمليات الحسّاسة — لا يُفشل الطلب إذا فشل التسجيل */
export async function audit(req: Request, input: AuditInput): Promise<void> {
  try {
    await AuditLog.create({
      userId: req.user?.id ? new Types.ObjectId(req.user.id) : undefined,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      businessId: req.user?.businessId ? new Types.ObjectId(req.user.businessId) : undefined,
      before: input.before,
      after: input.after,
      ip: req.ip,
    });
  } catch (e) {
    logger.warn('تعذّر كتابة سجل التدقيق', e);
  }
}
