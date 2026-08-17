import { Router } from 'express';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { Model } from 'mongoose';
import { z, ZodSchema } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { notFound } from '../utils/errors';
import { requireAuth, requirePlatform } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { audit } from './audit';

interface CrudOptions<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<T> & any;
  resource: string;
  createSchema: ZodSchema;
  updateSchema: ZodSchema;
  /** الحقول المسموح بها في القراءة العامة (بدون تسجيل دخول) */
  publicFilter?: Record<string, unknown>;
  publicSelect?: string;
  defaultSort?: string;
  /** إتاحة GET بدون مصادقة */
  publicRead?: boolean;
}

/**
 * مصنع مسارات CRUD لموارد لوحة تحكم رواء.
 * القراءة قد تكون عامة، أما الكتابة فمحصورة بمدير المنصة دائمًا.
 */
export function crudRouter<T>(opts: CrudOptions<T>): Router {
  const r = Router();
  const {
    model, resource, createSchema, updateSchema,
    publicFilter = { isActive: true }, publicSelect, defaultSort = 'sortOrder createdAt', publicRead = true,
  } = opts;

  const listQuery = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(50),
    all: z.coerce.boolean().default(false),
    q: z.string().optional(),
  });

  // قراءة عامة
  if (publicRead) {
    r.get('/', asyncHandler(async (_req, res) => {
      const items = await model.find(publicFilter).select(publicSelect ?? '').sort(defaultSort).lean();
      res.json({ items });
    }));

    r.get('/:id', asyncHandler(async (req, res) => {
      const item = await model.findOne({ _id: req.params.id, ...publicFilter }).lean();
      if (!item) throw notFound();
      res.json(item);
    }));
  }

  // قراءة إدارية كاملة (تشمل المعطّل)
  r.get('/admin/all', requireAuth, requirePlatform, validate(listQuery, 'query'),
    asyncHandler(async (req, res) => {
      const { page, limit, all } = req.query as unknown as z.infer<typeof listQuery>;
      const q = model.find().sort(defaultSort);
      if (!all) q.skip((page - 1) * limit).limit(limit);
      const [items, total] = await Promise.all([q.lean(), model.countDocuments()]);
      res.json({ items, total, page, limit });
    }));

  r.post('/', requireAuth, requirePlatform, validate(createSchema),
    asyncHandler(async (req, res) => {
      const created = await model.create(req.body);
      await audit(req, { action: 'create', resource, resourceId: String(created._id), after: created.toObject?.() ?? created });
      res.status(201).json(created);
    }));

  r.patch('/:id', requireAuth, requirePlatform, validate(updateSchema),
    asyncHandler(async (req, res) => {
      const before = await model.findById(req.params.id).lean();
      if (!before) throw notFound();
      const updated = await model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      await audit(req, { action: 'update', resource, resourceId: req.params.id, before, after: updated?.toObject() });
      res.json(updated);
    }));

  r.delete('/:id', requireAuth, requirePlatform,
    asyncHandler(async (req, res) => {
      const before = await model.findById(req.params.id).lean();
      if (!before) throw notFound();
      await model.findByIdAndDelete(req.params.id);
      await audit(req, { action: 'delete', resource, resourceId: req.params.id, before });
      res.status(204).send();
    }));

  return r;
}

/** مخطط النص ثنائي اللغة */
export const i18nSchema = z.object({ ar: z.string().default(''), en: z.string().default('') });
