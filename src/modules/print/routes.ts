import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * توقيع أوامر QZ Tray.
 *
 * المفتاح الخاص يبقى هنا على الخادم ولا يصل إلى المتصفح إطلاقًا.
 * الشهادة العامة فقط هي ما يُرسل للواجهة — وهي عامة بطبيعتها.
 *
 * بدون هذين المتغيرين يعمل النظام لكن QZ Tray سيعرض نافذة تأكيد
 * مع كل طباعة، وهو غير عملي على شاشة الكاشير.
 */
const PRIVATE_KEY = process.env.QZ_PRIVATE_KEY ?? '';
const CERTIFICATE = process.env.QZ_CERTIFICATE ?? '';

const isConfigured = () => Boolean(PRIVATE_KEY && CERTIFICATE);

/** الشهادة العامة — يطلبها QZ Tray من المتصفح قبل الطباعة */
router.get('/certificate', asyncHandler(async (_req, res) => {
  if (!CERTIFICATE) {
    // نص فارغ يجعل QZ Tray يعمل في الوضع غير الموقّع بدل أن يفشل
    res.type('text/plain').send('');
    return;
  }
  res.type('text/plain').send(CERTIFICATE.replace(/\\n/g, '\n'));
}));

const signSchema = z.object({ request: z.string().min(1).max(20000) });

/**
 * توقيع الطلب بـ SHA512withRSA.
 * محمي بالمصادقة: لا نوقّع إلا لمستخدم مسجّل دخوله في لوحة التحكم.
 */
router.post('/sign', requireAuth, validate(signSchema), asyncHandler(async (req, res) => {
  if (!isConfigured()) throw new AppError(503, 'توقيع QZ Tray غير مهيّأ على الخادم');

  try {
    const signer = crypto.createSign('SHA512');
    signer.update((req.body as z.infer<typeof signSchema>).request);
    signer.end();
    const signature = signer.sign(PRIVATE_KEY.replace(/\\n/g, '\n'), 'base64');
    res.type('text/plain').send(signature);
  } catch (e) {
    logger.error('فشل توقيع QZ Tray', e);
    throw new AppError(500, 'تعذّر توقيع أمر الطباعة');
  }
}));

/** تخبر الواجهة هل التوقيع متاح، لتعرض تنبيهًا مناسبًا للموظف */
router.get('/status', asyncHandler(async (_req, res) => {
  res.json({ signingConfigured: isConfigured() });
}));

export default router;
