import { Router } from 'express';
import { z } from 'zod';
import authRoutes from '../modules/auth/routes';
import settingsRoutes from '../modules/settings/routes';
import servicesRoutes from '../modules/services/routes';
import uploadRoutes from '../modules/upload/routes';
import accountRoutes from '../modules/account/routes';
import contentRoutes from '../modules/content/routes';
import mediaRoutes from '../modules/media/routes';
import ordersRoutes from '../modules/orders/routes';
import discountRoutes from '../modules/orders/discount';
import businessesRoutes from '../modules/businesses/routes';
import tenantRoutes from '../modules/tenant/routes';
import shopRoutes from '../modules/shop/routes';
import printRoutes from '../modules/print/routes';
import communityRoutes from '../modules/community/routes';
import communityAuthRoutes from '../modules/community/auth';
import communityAdminRoutes from '../modules/community/admin';
import { crudRouter, i18nSchema } from '../lib/crudFactory';
import { Client } from '../models/Client';
import { DemoSite } from '../models/DemoSite';
import { Representative } from '../models/Representative';
import { DiscountCode } from '../models/DiscountCode';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'rawaa-api', time: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/settings', settingsRoutes);
router.use('/services', servicesRoutes);
router.use('/upload', uploadRoutes);
router.use('/account', accountRoutes);
router.use('/content', contentRoutes);
router.use('/media', mediaRoutes);
router.use('/platform-orders', ordersRoutes);
router.use('/discount-codes', discountRoutes);
router.use('/businesses', businessesRoutes);
// كل ما تحت /t/:businessId محمي بـ tenantScope داخل الموجّه نفسه
router.use('/t/:businessId', tenantRoutes);
// واجهة المتجر العامة (بلا مصادقة)
router.use('/shop', shopRoutes);
router.use('/print', printRoutes);
// تسجيل الحساب واستعادته تحت /auth حتى تعمل كوكي الجلسة (مسارها /api/auth)
router.use('/auth', communityAuthRoutes);
router.use('/community', communityRoutes);
router.use('/admin/community', communityAdminRoutes);

// عملاء رواء — صفحة /clients
const clientSchema = z.object({
  name: z.string().min(2),
  brandName: z.string().min(1),
  logoUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  description: i18nSchema.optional(),
  websiteUrl: z.string().optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
});
router.use('/clients', crudRouter({
  model: Client, resource: 'client',
  createSchema: clientSchema, updateSchema: clientSchema.partial(),
}));

// مواقع التجربة — صفحة /demo
const demoSchema = z.object({
  restaurantName: z.string().min(2),
  logoUrl: z.string().optional(),
  demoUrl: z.string().min(4),
  orderUrl: z.string().optional(),
  description: i18nSchema.optional(),
  status: z.enum(['live', 'maintenance', 'offline']).optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
});
router.use('/demo', crudRouter({
  model: DemoSite, resource: 'demo_site',
  createSchema: demoSchema, updateSchema: demoSchema.partial(),
}));

// المندوبون — إداري بالكامل، لا قراءة عامة
const repSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6),
  email: z.string().email().optional().or(z.literal('')),
  commissionPercent: z.number().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional(),
});
router.use('/reps', crudRouter({
  model: Representative, resource: 'representative',
  createSchema: repSchema, updateSchema: repSchema.partial(),
  publicRead: false, defaultSort: 'name',
}));

// أكواد الخصم — إدارة كاملة (التحقق العام في modules/orders/discount)
const discountCodeSchema = z.object({
  code: z.string().min(2).max(24),
  representativeId: z.string().optional(),
  discountPercent: z.number().min(0).max(100),
  // 0 من الواجهة تعني "غير محدود" — تُحوَّل إلى null لأن منطق التحقق
  // يعتبر أي رقم حدًّا أقصى، فكان الكود يصبح غير صالح فور إنشائه
  maxUses: z.number().nullable().optional().transform((v) => (v === 0 ? null : v)),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  isActive: z.boolean().optional(),
});
router.use('/admin/discount-codes', crudRouter({
  model: DiscountCode, resource: 'discount_code',
  createSchema: discountCodeSchema, updateSchema: discountCodeSchema.partial(),
  publicRead: false, defaultSort: '-createdAt',
}));

export default router;
