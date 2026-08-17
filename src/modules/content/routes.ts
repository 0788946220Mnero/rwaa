import { Router } from 'express';
import { z } from 'zod';
import { ContentBlock } from '../../models/ContentBlock';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth, requirePlatform } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { i18nSchema } from '../../lib/crudFactory';
import { audit } from '../../lib/audit';
import { notFound } from '../../utils/errors';

const router = Router();

const blockSchema = z.object({
  page: z.string().min(2),
  key: z.string().min(2),
  title: i18nSchema.optional(),
  subtitle: i18nSchema.optional(),
  description: i18nSchema.optional(),
  buttonText: i18nSchema.optional(),
  buttonUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  images: z.array(z.string()).optional(),
  extra: z.record(z.unknown()).optional(),
  sortOrder: z.number().optional(),
  isVisible: z.boolean().optional(),
});

/** محتوى صفحة كاملة — يستهلكه الموقع العام. الأقسام المخفية لا تُرسل أصلاً */
router.get('/admin/all', requireAuth, requirePlatform, asyncHandler(async (req, res) => {
  const filter = req.query.page ? { page: String(req.query.page).toLowerCase() } : {};
  const items = await ContentBlock.find(filter).sort('page sortOrder').lean();
  res.json({ items });
}));

router.post('/', requireAuth, requirePlatform, validate(blockSchema), asyncHandler(async (req, res) => {
  const created = await ContentBlock.create(req.body);
  await audit(req, { action: 'create', resource: 'content_block', resourceId: String(created._id), after: created.toObject() });
  res.status(201).json(created);
}));

/** تحديث دفعة أقسام مرة واحدة — لحفظ صفحة كاملة بضغطة */
const bulkSchema = z.object({ blocks: z.array(blockSchema.partial().extend({ _id: z.string() })) });

router.put('/bulk', requireAuth, requirePlatform, validate(bulkSchema), asyncHandler(async (req, res) => {
  const { blocks } = req.body as z.infer<typeof bulkSchema>;
  await Promise.all(blocks.map(({ _id, ...rest }) =>
    ContentBlock.findByIdAndUpdate(_id, rest, { runValidators: true })));
  await audit(req, { action: 'bulk_update', resource: 'content_block', after: blocks.map((b) => b._id) });
  const items = await ContentBlock.find({ _id: { $in: blocks.map((b) => b._id) } }).lean();
  res.json({ items });
}));

router.patch('/:id', requireAuth, requirePlatform, validate(blockSchema.partial()), asyncHandler(async (req, res) => {
  const before = await ContentBlock.findById(req.params.id).lean();
  if (!before) throw notFound();
  const updated = await ContentBlock.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  await audit(req, { action: 'update', resource: 'content_block', resourceId: req.params.id, before, after: updated?.toObject() });
  res.json(updated);
}));

router.delete('/:id', requireAuth, requirePlatform, asyncHandler(async (req, res) => {
  const before = await ContentBlock.findById(req.params.id).lean();
  if (!before) throw notFound();
  await ContentBlock.findByIdAndDelete(req.params.id);
  await audit(req, { action: 'delete', resource: 'content_block', resourceId: req.params.id, before });
  res.status(204).send();
}));

// يجب أن يأتي بعد المسارات الثابتة حتى لا يبتلعها
router.get('/:page', asyncHandler(async (req, res) => {
  const blocks = await ContentBlock.find({ page: req.params.page.toLowerCase(), isVisible: true })
    .sort('sortOrder').lean();
  const map: Record<string, unknown> = {};
  for (const b of blocks) map[b.key] = b;
  res.json({ page: req.params.page, blocks, map });
}));

export default router;
