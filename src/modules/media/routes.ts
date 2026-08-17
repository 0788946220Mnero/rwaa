import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Media } from '../../models/Media';
import { cloudinary, isCloudinaryConfigured } from '../../config/cloudinary';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth, requirePlatform } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { i18nSchema } from '../../lib/crudFactory';
import { audit } from '../../lib/audit';
import { notFound } from '../../utils/errors';

const router = Router();

const recordSchema = z.object({
  publicId: z.string().min(1),
  url: z.string().url(),
  folder: z.string().optional(),
  tag: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  format: z.string().optional(),
  bytes: z.number().optional(),
  alt: i18nSchema.optional(),
});

/** تسجيل الصورة في المكتبة بعد رفعها إلى Cloudinary من المتصفح */
router.post('/', requireAuth, validate(recordSchema), asyncHandler(async (req, res) => {
  const doc = await Media.findOneAndUpdate(
    { publicId: req.body.publicId },
    { ...req.body, uploadedBy: new Types.ObjectId(req.user!.id) },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  res.status(201).json(doc);
}));

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query.tag) filter.tag = req.query.tag;
  if (req.query.folder) filter.folder = req.query.folder;
  const limit = Math.min(Number(req.query.limit ?? 60), 200);
  const items = await Media.find(filter).sort('-createdAt').limit(limit).lean();
  res.json({ items });
}));

router.patch('/:id', requireAuth, requirePlatform,
  validate(z.object({ alt: i18nSchema.optional(), tag: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const updated = await Media.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) throw notFound();
    res.json(updated);
  }));

/** الحذف يزيل الملف من Cloudinary والسجل معًا */
router.delete('/:id', requireAuth, requirePlatform, asyncHandler(async (req, res) => {
  const doc = await Media.findById(req.params.id);
  if (!doc) throw notFound();
  if (isCloudinaryConfigured()) {
    try { await cloudinary.uploader.destroy(doc.publicId); } catch { /* السجل يُحذف رغم ذلك */ }
  }
  await doc.deleteOne();
  await audit(req, { action: 'delete', resource: 'media', resourceId: req.params.id, before: doc.toObject() });
  res.status(204).send();
}));

export default router;
