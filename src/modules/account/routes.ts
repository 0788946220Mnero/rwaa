import { Router } from 'express';
import { z } from 'zod';
import { User, hashPassword } from '../../models/User';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { audit } from '../../lib/audit';
import { clearRefreshCookie } from '../../lib/tokens';
import { badRequest, forbidden, notFound } from '../../utils/errors';
import { ROLES } from '../../shared';

const router = Router();
const onlyAdmin = requireRole(ROLES.PLATFORM_ADMIN);

/** ملف الحساب — لا يُرسل الهاش ولا tokenVersion (يُنزعان في toJSON) */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw notFound();
  res.json(user.toJSON());
}));

const profileSchema = z.object({
  name: z.string().min(2).optional(),
  username: z.string().min(3).max(32).regex(/^[a-z0-9_.-]+$/i, 'حروف وأرقام و . _ - فقط').optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

router.patch('/', requireAuth, validate(profileSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof profileSchema>;
  const before = await User.findById(req.user!.id).lean();
  if (!before) throw notFound();

  // التحقق من التفرد قبل الحفظ لإعطاء رسالة عربية واضحة بدل خطأ 11000
  if (body.username) {
    const taken = await User.findOne({ username: body.username.toLowerCase(), _id: { $ne: req.user!.id } });
    if (taken) throw badRequest('اسم المستخدم مستخدم مسبقًا');
  }
  if (body.email) {
    const taken = await User.findOne({ email: body.email.toLowerCase(), _id: { $ne: req.user!.id } });
    if (taken) throw badRequest('البريد الإلكتروني مستخدم مسبقًا');
  }

  const updated = await User.findByIdAndUpdate(req.user!.id, body, { new: true, runValidators: true });
  await audit(req, { action: 'update_profile', resource: 'user', resourceId: req.user!.id,
    before: { name: before.name, username: before.username, email: before.email }, after: body });
  res.json(updated!.toJSON());
}));

/** تسجيل الخروج من جميع الجلسات (البند 49) */
router.post('/revoke-sessions', requireAuth, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw notFound();
  user.tokenVersion += 1;
  await user.save();
  clearRefreshCookie(res);
  await audit(req, { action: 'revoke_all_sessions', resource: 'user', resourceId: req.user!.id });
  res.json({ message: 'تم إنهاء جميع الجلسات. سجّل الدخول من جديد.' });
}));

// ---------------- إدارة المستخدمين (مدير المنصة فقط) ----------------

router.get('/users', requireAuth, onlyAdmin, asyncHandler(async (_req, res) => {
  const items = await User.find().sort('-createdAt').lean();
  const safe = items.map(({ passwordHash, tokenVersion, ...rest }) => rest);
  res.json({ items: safe });
}));

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  username: z.string().min(3).optional(),
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل'),
  role: z.enum([ROLES.PLATFORM_ADMIN, ROLES.PLATFORM_STAFF, ROLES.BUSINESS_OWNER, ROLES.BUSINESS_STAFF]),
  businessId: z.string().optional(),
});

router.post('/users', requireAuth, onlyAdmin, validate(createUserSchema), asyncHandler(async (req, res) => {
  const { password, ...rest } = req.body as z.infer<typeof createUserSchema>;
  const created = await User.create({ ...rest, passwordHash: await hashPassword(password) });
  await audit(req, { action: 'create_user', resource: 'user', resourceId: String(created._id), after: { email: created.email, role: created.role } });
  res.status(201).json(created.toJSON());
}));

/** تفعيل / تعطيل حساب — التعطيل يُنهي جلساته فورًا */
router.patch('/users/:id/active', requireAuth, onlyAdmin,
  validate(z.object({ isActive: z.boolean() })),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.id) throw badRequest('لا يمكنك تعطيل حسابك الحالي');
    const user = await User.findById(req.params.id);
    if (!user) throw notFound();
    user.isActive = req.body.isActive;
    if (!req.body.isActive) user.tokenVersion += 1;
    await user.save();
    await audit(req, { action: 'set_user_active', resource: 'user', resourceId: req.params.id, after: { isActive: user.isActive } });
    res.json(user.toJSON());
  }));

/**
 * إعادة تعيين كلمة مرور مستخدم آخر (البند 50).
 * المدير يضع كلمة جديدة ولا يرى القديمة إطلاقًا — الهاش أحادي الاتجاه.
 */
router.post('/users/:id/reset-password', requireAuth, onlyAdmin,
  validate(z.object({ newPassword: z.string().min(8) })),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw notFound();
    if (user.role === ROLES.PLATFORM_ADMIN && req.params.id !== req.user!.id) {
      throw forbidden('لا يمكن إعادة تعيين كلمة مرور مدير آخر من هنا — استخدم سكربت الاستعادة على الخادم');
    }
    user.passwordHash = await hashPassword(req.body.newPassword);
    user.tokenVersion += 1;
    await user.save();
    await audit(req, { action: 'reset_password', resource: 'user', resourceId: req.params.id });
    res.json({ message: 'تم تعيين كلمة مرور جديدة وإنهاء جلسات المستخدم' });
  }));

router.delete('/users/:id', requireAuth, onlyAdmin, asyncHandler(async (req, res) => {
  if (req.params.id === req.user!.id) throw badRequest('لا يمكنك حذف حسابك الحالي');
  const before = await User.findById(req.params.id).lean();
  if (!before) throw notFound();
  await User.findByIdAndDelete(req.params.id);
  await audit(req, { action: 'delete_user', resource: 'user', resourceId: req.params.id, before: { email: before.email, role: before.role } });
  res.status(204).send();
}));

export default router;
