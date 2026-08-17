import { Router } from 'express';
import { z } from 'zod';
import { Setting } from '../../models/Setting';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth, requirePlatform } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { audit } from '../../lib/audit';

const router = Router();

/** الإعدادات العامة — يستهلكها الموقع لبناء الواجهة (شعار، خلفية، نصوص، تواصل) */
/**
 * حارس إضافي (البند 67): حتى لو وُضع مفتاح حسّاس في قاعدة البيانات بالخطأ،
 * لا يخرج أبدًا عبر المسار العام. الأسرار مكانها متغيرات البيئة لا قاعدة البيانات.
 */
const BLOCKED_KEYS = /secret|password|token|apiKey|api_key|credential|private/i;

router.get('/', asyncHandler(async (_req, res) => {
  const docs = (await Setting.find({ isPublic: true }).lean())
    .filter((d) => !BLOCKED_KEYS.test(d.key));
  const map: Record<string, unknown> = {};
  for (const d of docs) map[d.key] = d.value;
  res.json(map);
}));

router.get('/admin', requireAuth, requirePlatform, asyncHandler(async (_req, res) => {
  const docs = (await Setting.find().sort('group key').lean())
    .filter((d) => !BLOCKED_KEYS.test(d.key));
  res.json({ items: docs });
}));

const upsertSchema = z.object({
  values: z.record(z.unknown()),
});

/** تحديث دفعة إعدادات مرة واحدة */
router.put('/', requireAuth, requirePlatform, validate(upsertSchema), asyncHandler(async (req, res) => {
  const { values } = req.body as z.infer<typeof upsertSchema>;
  const blocked = Object.keys(values).filter((k) => BLOCKED_KEYS.test(k));
  if (blocked.length) {
    res.status(400).json({ message: `مفاتيح غير مسموح بحفظها في قاعدة البيانات: ${blocked.join(', ')}` });
    return;
  }
  const before = await Setting.find({ key: { $in: Object.keys(values) } }).lean();

  await Promise.all(
    Object.entries(values).map(([key, value]) =>
      Setting.findOneAndUpdate({ key }, { key, value }, { upsert: true, new: true }),
    ),
  );

  await audit(req, { action: 'update', resource: 'settings', before, after: values });
  const docs = await Setting.find().lean();
  res.json({ items: docs });
}));

export default router;
