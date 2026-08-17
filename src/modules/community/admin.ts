import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { User } from '../../models/User';
import { Post } from '../../models/Post';
import { Comment } from '../../models/Comment';
import { Report } from '../../models/Report';
import { PasswordResetRequest } from '../../models/PasswordResetRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth, requirePlatform } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { audit } from '../../lib/audit';
import { notFound, badRequest } from '../../utils/errors';
import { normalizePhone } from '../../lib/phone';
import { generateResetCode } from './auth';
import { ROLES } from '../../shared';

const router = Router();
router.use(requireAuth, requirePlatform);

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------- المستخدمون ----------------

/** الإدارة وحدها ترى رقم الهاتف */
router.get('/users', asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const filter: Record<string, unknown> = { role: ROLES.COMMUNITY_MEMBER };

  if (q) {
    const safe = escapeRegex(q);
    const or: Record<string, unknown>[] = [
      { username: new RegExp(safe, 'i') },
      { displayName: new RegExp(safe, 'i') },
      { name: new RegExp(safe, 'i') },
      { phone: new RegExp(safe, 'i') },
    ];
    // بحث بالرقم بأي صيغة يكتبها الموظف
    if (/[0-9]/.test(q)) or.push({ phone: normalizePhone(q) });
    filter.$or = or;
  }

  const items = await User.find(filter)
    .select('_id name displayName username phone status createdAt lastLoginAt')
    .sort('-createdAt').limit(100).lean();

  res.json({ items });
}));

router.patch('/users/:id/status', validate(z.object({
  status: z.enum(['active', 'suspended', 'deleted']),
})), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw notFound('المستخدم غير موجود');

  user.status = req.body.status;
  if (req.body.status !== 'active') user.tokenVersion += 1; // إنهاء جلساته فورًا
  await user.save();

  await audit(req, { action: 'set_community_user_status', resource: 'user', resourceId: req.params.id, after: { status: user.status } });
  res.json({ _id: user._id, status: user.status });
}));

// ---------------- المنشورات والتعليقات ----------------

router.get('/posts', asyncHandler(async (req, res) => {
  const status = String(req.query.status ?? '');
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (req.query.reportedOnly === 'true') filter.reportsCount = { $gt: 0 };

  const posts = await Post.find(filter).sort('-createdAt').limit(60).lean();
  const authors = await User.find({ _id: { $in: posts.map((p) => p.authorId) } })
    .select('_id displayName name username phone').lean();
  const map = new Map(authors.map((a) => [String(a._id), a]));

  res.json({
    items: posts.map((p) => ({ ...p, author: map.get(String(p.authorId)) ?? null })),
  });
}));

router.patch('/posts/:id/status', validate(z.object({
  status: z.enum(['active', 'hidden', 'deleted']),
  reason: z.string().max(200).optional(),
})), asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) throw notFound('المنشور غير موجود');

  post.status = req.body.status;
  post.hiddenBy = new Types.ObjectId(req.user!.id);
  post.hiddenReason = req.body.reason;
  await post.save();

  await audit(req, { action: 'moderate_post', resource: 'post', resourceId: req.params.id, after: { status: post.status } });
  res.json(post);
}));

router.get('/comments', asyncHandler(async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query.postId) filter.postId = req.query.postId;
  if (req.query.reportedOnly === 'true') filter.reportsCount = { $gt: 0 };

  const comments = await Comment.find(filter).sort('-createdAt').limit(100).lean();
  const authors = await User.find({ _id: { $in: comments.map((c) => c.authorId) } })
    .select('_id displayName name username').lean();
  const map = new Map(authors.map((a) => [String(a._id), a]));

  res.json({ items: comments.map((c) => ({ ...c, author: map.get(String(c.authorId)) ?? null })) });
}));

router.patch('/comments/:id/status', validate(z.object({
  status: z.enum(['active', 'hidden', 'deleted']),
})), asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) throw notFound('التعليق غير موجود');

  const wasActive = comment.status === 'active';
  comment.status = req.body.status;
  await comment.save();

  if (wasActive && req.body.status !== 'active') {
    await Post.updateOne({ _id: comment.postId, commentsCount: { $gt: 0 } }, { $inc: { commentsCount: -1 } });
  }
  res.json(comment);
}));

// ---------------- البلاغات ----------------

router.get('/reports', asyncHandler(async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query.status) filter.status = req.query.status;

  const reports = await Report.find(filter).sort('-createdAt').limit(100).lean();

  const postIds = reports.filter((r) => r.targetType === 'post').map((r) => r.targetId);
  const commentIds = reports.filter((r) => r.targetType === 'comment').map((r) => r.targetId);

  const [posts, comments, reporters] = await Promise.all([
    Post.find({ _id: { $in: postIds } }).select('_id text status').lean(),
    Comment.find({ _id: { $in: commentIds } }).select('_id text status postId').lean(),
    User.find({ _id: { $in: reports.map((r) => r.reporterId) } }).select('_id displayName name username').lean(),
  ]);

  const pMap = new Map(posts.map((p) => [String(p._id), p]));
  const cMap = new Map(comments.map((c) => [String(c._id), c]));
  const rMap = new Map(reporters.map((u) => [String(u._id), u]));

  res.json({
    items: reports.map((r) => ({
      ...r,
      reporter: rMap.get(String(r.reporterId)) ?? null,
      target: r.targetType === 'post' ? pMap.get(String(r.targetId)) : cMap.get(String(r.targetId)),
    })),
  });
}));

router.patch('/reports/:id', validate(z.object({
  status: z.enum(['pending', 'reviewed', 'dismissed']),
})), asyncHandler(async (req, res) => {
  const updated = await Report.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status, reviewedBy: new Types.ObjectId(req.user!.id), reviewedAt: new Date() },
    { new: true },
  );
  if (!updated) throw notFound('البلاغ غير موجود');
  res.json(updated);
}));

// ---------------- طلبات استعادة كلمة المرور ----------------

router.get('/password-resets', asyncHandler(async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query.status) filter.status = req.query.status;

  const items = await PasswordResetRequest.find(filter).sort('-createdAt').limit(60).lean();
  const users = await User.find({ _id: { $in: items.map((i) => i.userId) } })
    .select('_id displayName name username phone').lean();
  const map = new Map(users.map((u) => [String(u._id), u]));

  res.json({
    items: items.map((i) => ({
      _id: i._id,
      phone: i.phone,
      status: i.status,
      createdAt: i.createdAt,
      codeIssuedAt: i.codeIssuedAt,
      expiresAt: i.expiresAt,
      usedAt: i.usedAt,
      attempts: i.attempts,
      // الكود نفسه لا يُخزَّن نصًا، فلا يمكن عرضه بعد التوليد
      user: map.get(String(i.userId)) ?? null,
    })),
  });
}));

/**
 * توليد كود الاستعادة.
 * يظهر نصًا مرة واحدة فقط في هذه الاستجابة — بعدها لا يُخزَّن إلا كبصمة،
 * فلا يستطيع أحد استخراجه من قاعدة البيانات لاحقًا.
 */
router.post('/password-resets/:id/code', asyncHandler(async (req, res) => {
  const request = await PasswordResetRequest.findById(req.params.id);
  if (!request) throw notFound('الطلب غير موجود');
  if (request.status === 'used') throw badRequest('هذا الطلب استُخدم مسبقًا');

  const code = generateResetCode();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 ساعة

  request.codeHash = await bcrypt.hash(code, 10);
  request.codeIssuedAt = new Date();
  request.expiresAt = expiresAt;
  request.attempts = 0;
  request.status = 'code_issued';
  request.issuedBy = new Types.ObjectId(req.user!.id);
  await request.save();

  await audit(req, { action: 'issue_reset_code', resource: 'password_reset', resourceId: req.params.id });

  res.json({ code, expiresAt, message: 'الكود يظهر مرة واحدة فقط — انسخه الآن.' });
}));

router.post('/password-resets/:id/cancel', asyncHandler(async (req, res) => {
  const request = await PasswordResetRequest.findById(req.params.id);
  if (!request) throw notFound('الطلب غير موجود');

  request.status = 'cancelled';
  request.codeHash = undefined;
  await request.save();

  await audit(req, { action: 'cancel_reset_code', resource: 'password_reset', resourceId: req.params.id });
  res.json({ message: 'أُبطل الكود' });
}));

// ---------------- ملخص ----------------

router.get('/stats', asyncHandler(async (_req, res) => {
  const [users, posts, hidden, pendingReports, openResets] = await Promise.all([
    User.countDocuments({ role: ROLES.COMMUNITY_MEMBER }),
    Post.countDocuments({ status: 'active' }),
    Post.countDocuments({ status: 'hidden' }),
    Report.countDocuments({ status: 'pending' }),
    PasswordResetRequest.countDocuments({ status: { $in: ['pending', 'code_issued'] } }),
  ]);
  res.json({ users, posts, hidden, pendingReports, openResets });
}));

export default router;
