import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { badRequest } from '../utils/errors';
import { logger } from '../utils/logger';

type Source = 'body' | 'query' | 'params';

/** أسماء عربية للحقول حتى تكون رسالة الخطأ مفهومة للمستخدم لا للمطور فقط */
const FIELD_LABELS: Record<string, string> = {
  name: 'الاسم',
  phone: 'رقم الهاتف',
  email: 'البريد الإلكتروني',
  businessName: 'اسم النشاط',
  businessType: 'نوع النشاط',
  city: 'المدينة',
  notes: 'الملاحظات',
  serviceIds: 'الخدمات المختارة',
  discountCode: 'كود الخصم',
  customer: 'بيانات العميل',
  items: 'الأصناف',
  address: 'العنوان',
  qty: 'الكمية',
  productId: 'المنتج',
  price: 'السعر',
  code: 'الكود',
  slug: 'المعرّف',
  password: 'كلمة المرور',
  identifier: 'اسم المستخدم أو البريد',
};

const label = (path: (string | number)[]): string => {
  const key = String(path[path.length - 1] ?? '');
  return FIELD_LABELS[key] ?? key;
};

export const validate =
  (schema: ZodSchema, source: Source = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const issues = result.error.issues.slice(0, 4);

      // رسالة تسمّي الحقل المرفوض بدل "بيانات غير صالحة" المبهمة
      const summary = issues
        .map((i) => (i.path.length ? `${label(i.path)}: ${i.message}` : i.message))
        .join(' · ');

      logger.warn(`تحقق مرفوض على ${req.method} ${req.originalUrl}`, {
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })),
      });

      return next(badRequest(summary || 'بيانات غير صالحة', result.error.flatten()));
    }

    req[source] = result.data as never;
    next();
  };
