import { Router } from 'express';
import { z } from 'zod';
import { cloudinary, isCloudinaryConfigured } from '../../config/cloudinary';
import { env } from '../../config/env';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AppError, badRequest } from '../../utils/errors';

const router = Router();

const signSchema = z.object({
  folder: z.string().max(80).optional(),
});

/**
 * توقيع رفع Cloudinary.
 * الملف يُرفع من المتصفح مباشرة إلى Cloudinary، والسيرفر يوقّع فقط —
 * فلا يمر أي ملف عبر الخادم ولا يُخزَّن محليًا (البند 32).
 */
router.post('/signature', requireAuth, validate(signSchema), asyncHandler(async (req, res) => {
  if (!isCloudinaryConfigured()) throw new AppError(503, 'Cloudinary غير مهيّأ على الخادم');

  const sub = (req.body.folder as string | undefined)?.replace(/[^a-zA-Z0-9_-]/g, '') ?? 'general';
  const folder = `${env.cloudinary.folder}/${sub}`;
  const timestamp = Math.round(Date.now() / 1000);

  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    env.cloudinary.apiSecret,
  );

  res.json({
    signature,
    timestamp,
    folder,
    apiKey: env.cloudinary.apiKey,
    cloudName: env.cloudinary.cloudName,
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.cloudinary.cloudName}/image/upload`,
  });
}));

const destroySchema = z.object({ publicId: z.string().min(1) });

router.post('/destroy', requireAuth, validate(destroySchema), asyncHandler(async (req, res) => {
  if (!isCloudinaryConfigured()) throw new AppError(503, 'Cloudinary غير مهيّأ');
  const { publicId } = req.body as z.infer<typeof destroySchema>;
  if (!publicId.startsWith(env.cloudinary.folder)) throw badRequest('المعرّف خارج مجلد المنصة');
  const result = await cloudinary.uploader.destroy(publicId);
  res.json(result);
}));

export default router;
