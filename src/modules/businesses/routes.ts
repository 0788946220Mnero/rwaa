import { Router } from 'express';
import { z } from 'zod';
import { Business } from '../../models/Business';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth, requirePlatform } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { i18nSchema } from '../../lib/crudFactory';
import { audit } from '../../lib/audit';
import { badRequest, notFound } from '../../utils/errors';

const router = Router();

const contactSchema = z.object({
  phone: z.string().optional(), whatsapp: z.string().optional(), email: z.string().optional(),
  address: z.string().optional(), mapUrl: z.string().optional(),
}).partial();

const settingsSchema = z.object({
  currency: i18nSchema.optional(),
  deliveryFee: z.number().min(0).optional(),
  minOrder: z.number().min(0).optional(),
  taxRate: z.number().min(0).optional(),
  acceptsDelivery: z.boolean().optional(),
  acceptsPickup: z.boolean().optional(),
  verificationEnabled: z.boolean().optional(),
  printingEnabled: z.boolean().optional(),
  autoPrint: z.boolean().optional(),
}).partial();

const createSchema = z.object({
  name: i18nSchema,
  slug: z.string().min(2).max(48).regex(/^[a-z0-9-]+$/, 'حروف إنجليزية صغيرة وأرقام وشرطات فقط'),
  type: z.enum(['restaurant', 'fashion']),
  ownerId: z.string().optional(),
  logoUrl: z.string().optional(),
  heroUrl: z.string().optional(),
  description: i18nSchema.optional(),
  contact: contactSchema.optional(),
  status: z.enum(['open', 'busy', 'closed', 'paused']).optional(),
  statusMessage: i18nSchema.optional(),
  workingHours: z.array(z.object({
    day: z.number().min(0).max(6),
    openTime: z.string(), closeTime: z.string(), isClosed: z.boolean(),
  })).optional(),
  features: z.array(z.string()).optional(),
  settings: settingsSchema.optional(),
  isActive: z.boolean().optional(),
});

/** إدارة رواء فقط — إنشاء وإدارة الأنشطة */
router.get('/', requireAuth, requirePlatform, asyncHandler(async (_req, res) => {
  const items = await Business.find().sort('-createdAt').lean();
  res.json({ items });
}));

router.post('/', requireAuth, requirePlatform, validate(createSchema), asyncHandler(async (req, res) => {
  const exists = await Business.findOne({ slug: req.body.slug });
  if (exists) throw badRequest('المعرّف (slug) مستخدم مسبقًا');
  const created = await Business.create(req.body);
  await audit(req, { action: 'create', resource: 'business', resourceId: String(created._id), after: created.toObject() });
  res.status(201).json(created);
}));

router.patch('/:id', requireAuth, requirePlatform, validate(createSchema.partial()), asyncHandler(async (req, res) => {
  const before = await Business.findById(req.params.id).lean();
  if (!before) throw notFound('النشاط غير موجود');
  const updated = await Business.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  await audit(req, { action: 'update', resource: 'business', resourceId: req.params.id, before, after: updated?.toObject() });
  res.json(updated);
}));

router.delete('/:id', requireAuth, requirePlatform, asyncHandler(async (req, res) => {
  const before = await Business.findById(req.params.id).lean();
  if (!before) throw notFound('النشاط غير موجود');
  await Business.findByIdAndDelete(req.params.id);
  await audit(req, { action: 'delete', resource: 'business', resourceId: req.params.id, before });
  res.status(204).send();
}));

export default router;
