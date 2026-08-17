import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ message: `المسار غير موجود: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message, code: err.code, details: err.details });
    return;
  }

  const e = err as { name?: string; code?: number; message?: string; keyValue?: unknown };

  if (e?.name === 'ValidationError') {
    // نمرر رسالة Mongoose نفسها لأنها تسمّي الحقل والسبب
    logger.warn('خطأ تحقق من قاعدة البيانات', e?.message);
    res.status(400).json({
      message: env.isProd ? `بيانات غير صالحة: ${e?.message ?? ''}`.slice(0, 300) : (e?.message ?? 'بيانات غير صالحة'),
      code: 'VALIDATION_ERROR',
      details: e?.message,
    });
    return;
  }
  if (e?.name === 'CastError') {
    res.status(400).json({ message: 'معرّف غير صالح', code: 'INVALID_ID' });
    return;
  }
  if (e?.code === 11000) {
    res.status(409).json({ message: 'القيمة مستخدمة مسبقًا', code: 'DUPLICATE', details: e.keyValue });
    return;
  }

  logger.error('خطأ غير متوقع', err);
  res.status(500).json({
    message: 'حدث خطأ في الخادم',
    code: 'INTERNAL',
    ...(env.isProd ? {} : { details: e?.message }),
  });
}
