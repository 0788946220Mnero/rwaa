import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { User } from '../../models/User';
import { asyncHandler } from '../../utils/asyncHandler';
import { unauthorized, forbidden } from '../../utils/errors';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import {
  REFRESH_COOKIE, clearRefreshCookie, setRefreshCookie,
  signAccessToken, signRefreshToken, verifyRefresh,
} from '../../lib/tokens';
import { audit } from '../../lib/audit';
import { normalizePhone } from '../../lib/phone';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'محاولات كثيرة، حاول بعد قليل' },
});

// يقبل البريد أو اسم المستخدم (البند 49)
const loginSchema = z.object({
  identifier: z.string().min(3, 'أدخل البريد أو اسم المستخدم').optional(),
  email: z.string().optional(),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
}).refine((d) => Boolean(d.identifier ?? d.email), { message: 'أدخل البريد أو اسم المستخدم' });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل'),
});

function issueTokens(user: { _id: unknown; role: string; businessId?: unknown; tokenVersion: number }) {
  return {
    accessToken: signAccessToken({
      sub: String(user._id),
      role: user.role as never,
      businessId: user.businessId ? String(user.businessId) : undefined,
    }),
    refreshToken: signRefreshToken({ sub: String(user._id), tv: user.tokenVersion }),
  };
}

router.post('/login', loginLimiter, validate(loginSchema), asyncHandler(async (req, res) => {
  const { identifier, email, password } = req.body as z.infer<typeof loginSchema>;
  const id = (identifier ?? email ?? '').trim().toLowerCase();

  // البريد أو اسم المستخدم لموظفي رواء، ورقم الهاتف لأعضاء المجتمع.
  // الرقم يُطبَّع أولًا حتى يعمل 07... و+9627... على نفس الحساب.
  const or: Record<string, string>[] = [{ email: id }, { username: id }];
  if (/^[0-9+][0-9\s-]{6,}$/.test(id)) or.push({ phone: normalizePhone(id) });

  const user = await User.findOne({ $or: or }).select('+passwordHash');

  // رسالة واحدة للحالتين حتى لا نكشف وجود البريد من عدمه
  if (!user || !(await user.comparePassword(password))) throw unauthorized('بيانات الدخول غير صحيحة');
  if (!user.isActive || user.status === 'suspended') throw forbidden('الحساب معطّل');
  if (user.status === 'deleted') throw forbidden('الحساب محذوف');

  user.lastLoginAt = new Date();
  await user.save();

  const { accessToken, refreshToken } = issueTokens(user);
  setRefreshCookie(res, refreshToken);
  res.json({ accessToken, user: user.toJSON() });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw unauthorized('لا توجد جلسة');

  let payload;
  try {
    payload = verifyRefresh(token);
  } catch {
    throw unauthorized('الجلسة منتهية');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive || user.tokenVersion !== payload.tv) throw unauthorized('الجلسة غير صالحة');

  const tokens = issueTokens(user);
  setRefreshCookie(res, tokens.refreshToken);
  res.json({ accessToken: tokens.accessToken, user: user.toJSON() });
}));

router.post('/logout', asyncHandler(async (_req, res) => {
  clearRefreshCookie(res);
  res.status(204).send();
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw unauthorized();
  res.json(user.toJSON());
}));

router.post('/change-password', requireAuth, validate(changePasswordSchema), asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;
  const user = await User.findById(req.user!.id).select('+passwordHash');
  if (!user || !(await user.comparePassword(currentPassword))) throw unauthorized('كلمة المرور الحالية غير صحيحة');

  const { hashPassword } = await import('../../models/User');
  user.passwordHash = await hashPassword(newPassword);
  user.tokenVersion += 1; // إبطال كل الجلسات الأخرى
  await user.save();

  clearRefreshCookie(res);
  await audit(req, { action: 'change_password', resource: 'user', resourceId: String(user._id) });
  res.status(204).send();
}));

export default router;
