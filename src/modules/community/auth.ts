import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { User, hashPassword } from '../../models/User';
import { PasswordResetRequest } from '../../models/PasswordResetRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { badRequest } from '../../utils/errors';
import { normalizePhone, isValidPhone } from '../../lib/phone';
import { setRefreshCookie, signAccessToken, signRefreshToken } from '../../lib/tokens';
import { ROLES } from '../../shared';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'محاولات كثيرة، حاول بعد قليل' },
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'محاولات كثيرة، حاول بعد ساعة' },
});

// ---------------- إنشاء حساب ----------------

const registerSchema = z.object({
  phone: z.string().min(7, 'رقم الهاتف مطلوب'),
  displayName: z.string().trim().min(2, 'الاسم الظاهر مطلوب').max(60),
  username: z.string().trim().min(3, 'اسم المستخدم 3 أحرف على الأقل').max(24)
    .regex(/^[a-zA-Z0-9._]+$/, 'حروف إنجليزية وأرقام و . _ فقط'),
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'كلمتا المرور غير متطابقتين',
  path: ['confirmPassword'],
});

router.post('/register', authLimiter, validate(registerSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof registerSchema>;

  const phone = normalizePhone(body.phone);
  if (!isValidPhone(phone)) throw badRequest('رقم الهاتف غير صالح');

  const username = body.username.toLowerCase();

  // فحص مسبق لرسالة عربية واضحة؛ الفهرس الفريد هو الضمان الحقيقي
  const [phoneTaken, usernameTaken] = await Promise.all([
    User.findOne({ phone }).select('_id').lean(),
    User.findOne({ username }).select('_id').lean(),
  ]);
  if (phoneTaken) throw badRequest('رقم الهاتف مسجّل مسبقًا');
  if (usernameTaken) throw badRequest('اسم المستخدم محجوز');

  let user;
  try {
    user = await User.create({
      name: body.displayName,
      displayName: body.displayName,
      username,
      phone,
      passwordHash: await hashPassword(body.password),
      role: ROLES.COMMUNITY_MEMBER,
      status: 'active',
    });
  } catch (e) {
    const err = e as { code?: number };
    if (err.code === 11000) throw badRequest('رقم الهاتف أو اسم المستخدم مستخدم مسبقًا');
    throw e;
  }

  const accessToken = signAccessToken({ sub: String(user._id), role: user.role });
  setRefreshCookie(res, signRefreshToken({ sub: String(user._id), tv: user.tokenVersion }));

  res.status(201).json({
    accessToken,
    user: {
      _id: user._id,
      displayName: user.displayName,
      username: user.username,
      role: user.role,
      name: user.name,
    },
  });
}));

// ---------------- توفر اسم المستخدم ----------------

router.get('/username-available', asyncHandler(async (req, res) => {
  const raw = String(req.query.username ?? '').trim().toLowerCase();
  if (!/^[a-zA-Z0-9._]{3,24}$/.test(raw)) {
    res.json({ available: false, message: 'اسم غير صالح' });
    return;
  }
  const taken = await User.findOne({ username: raw }).select('_id').lean();
  res.json({ available: !taken });
}));

// ---------------- نسيت كلمة المرور ----------------

router.post('/forgot-password', resetLimiter, validate(z.object({ phone: z.string().min(7) })),
  asyncHandler(async (req, res) => {
    const phone = normalizePhone((req.body as { phone: string }).phone);
    const user = await User.findOne({ phone }).select('_id').lean();

    // رد موحّد في الحالتين حتى لا يُستخدم المسار لكشف الأرقام المسجّلة
    if (user) {
      const open = await PasswordResetRequest.findOne({
        userId: user._id,
        status: { $in: ['pending', 'code_issued'] },
      });
      if (!open) {
        await PasswordResetRequest.create({ userId: user._id, phone, status: 'pending' });
      }
    }

    res.json({ message: 'تم استلام طلبك. تواصل مع إدارة رواء للحصول على كود الاستعادة.' });
  }));

// ---------------- إعادة تعيين كلمة المرور بالكود ----------------

const resetSchema = z.object({
  phone: z.string().min(7),
  code: z.string().trim().regex(/^[0-9]{6}$/, 'الكود مكوّن من 6 أرقام'),
  newPassword: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل'),
});

const MAX_ATTEMPTS = 5;

router.post('/reset-password', resetLimiter, validate(resetSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof resetSchema>;
  const phone = normalizePhone(body.phone);

  const request = await PasswordResetRequest
    .findOne({ phone, status: 'code_issued' })
    .select('+codeHash')
    .sort({ createdAt: -1 });

  const generic = 'الكود غير صحيح أو منتهي الصلاحية';
  if (!request || !request.codeHash || !request.expiresAt) throw badRequest(generic);

  if (request.expiresAt.getTime() < Date.now()) {
    request.status = 'expired';
    await request.save();
    throw badRequest(generic);
  }

  if (request.attempts >= MAX_ATTEMPTS) {
    request.status = 'cancelled';
    await request.save();
    throw badRequest('تم تجاوز عدد المحاولات. اطلب كودًا جديدًا.');
  }

  const ok = await bcrypt.compare(body.code, request.codeHash);
  if (!ok) {
    request.attempts += 1;
    await request.save();
    throw badRequest(generic);
  }

  const user = await User.findById(request.userId);
  if (!user) throw badRequest(generic);

  user.passwordHash = await hashPassword(body.newPassword);
  user.tokenVersion += 1; // إبطال كل الجلسات القائمة
  await user.save();

  // الكود يُستهلك مرة واحدة ولا يعود صالحًا
  request.status = 'used';
  request.usedAt = new Date();
  request.codeHash = undefined;
  await request.save();

  res.json({ message: 'تم تغيير كلمة المرور. سجّل الدخول من جديد.' });
}));

/** يولّد كودًا من 6 أرقام — يُستدعى من لوحة الإدارة فقط */
export function generateResetCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export default router;
