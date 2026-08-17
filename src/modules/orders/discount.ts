import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { DiscountCode } from '../../models/DiscountCode';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';

const router = Router();

/** حد للمحاولات — كي لا يُستخدم المسار لتخمين الأكواد */
const limiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

router.post('/validate', limiter, validate(z.object({ code: z.string().min(2) })),
  asyncHandler(async (req, res) => {
    const code = await DiscountCode.findOne({ code: String(req.body.code).trim().toUpperCase() }).lean();
    const now = new Date();
    const valid = Boolean(
      code && code.isActive &&
      (!code.startsAt || now >= code.startsAt) &&
      (!code.expiresAt || now <= code.expiresAt) &&
      (code.maxUses === null || code.usedCount < code.maxUses),
    );
    // لا نكشف اسم المندوب ولا عدد الاستخدامات للعميل
    res.json(valid
      ? { valid: true, discountPercent: code!.discountPercent, code: code!.code }
      : { valid: false, message: 'كود الخصم غير صالح' });
  }));

export default router;
