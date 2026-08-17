import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { Post } from '../../models/Post';
import { Comment } from '../../models/Comment';
import { Like } from '../../models/Like';
import { Report } from '../../models/Report';
import { User } from '../../models/User';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth, optionalAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { badRequest, forbidden, notFound } from '../../utils/errors';
import { toPublicUser, PUBLIC_USER_FIELDS } from '../../lib/publicUser';
import { PLATFORM_ROLES, Role } from '../../shared';

const router = Router();

/**
 * القراءة متاحة للزوار؛ الكتابة تتطلب حسابًا.
 * optionalAuth يملأ req.user إن وُجد توكن صالح ولا يرفض الطلب إن غاب،
 * فيعرف الزائر المحتوى بينما تبقى كل عملية كتابة محمية بـ requireAuth.
 */
router.use(optionalAuth);

const isModerator = (role: Role) => PLATFORM_ROLES.includes(role);

const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'محاولات كثيرة، حاول بعد قليل' },
});

/** يمنع الحساب الموقوف من النشر أو التفاعل */
async function assertActive(userId: string): Promise<void> {
  const u = await User.findById(userId).select('status').lean();
  if (!u || u.status !== 'active') throw forbidden('حسابك موقوف حاليًا');
}

// ---------------- التصفح ----------------

const listQuery = z.object({
  limit: z.coerce.number().min(1).max(30).default(20),
  before: z.string().optional(),
});

router.get('/posts', validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const { limit, before } = req.query as unknown as z.infer<typeof listQuery>;

  const filter: Record<string, unknown> = { status: 'active' };
  if (before) {
    const d = new Date(before);
    if (!Number.isNaN(d.getTime())) filter.createdAt = { $lt: d };
  }

  // نطلب واحدًا زائدًا لنعرف إن كان هناك المزيد دون استعلام عدّ
  const docs = await Post.find(filter).sort({ createdAt: -1 }).limit(limit + 1).lean();
  const hasMore = docs.length > limit;
  const posts = hasMore ? docs.slice(0, limit) : docs;

  const authorIds = [...new Set(posts.map((p) => String(p.authorId)))];
  const postIds = posts.map((p) => p._id);

  const [authors, myLikes] = await Promise.all([
    User.find({ _id: { $in: authorIds } }).select(PUBLIC_USER_FIELDS).lean(),
    // الزائر بلا إعجابات سابقة
    req.user ? Like.find({ postId: { $in: postIds }, userId: req.user.id }).select('postId').lean() : [],
  ]);

  const authorMap = new Map(authors.map((a) => [String(a._id), a]));
  const likedSet = new Set(myLikes.map((l) => String(l.postId)));

  res.json({
    items: posts.map((p) => ({
      _id: p._id,
      text: p.text,
      imageUrl: p.imageUrl,
      likesCount: p.likesCount,
      commentsCount: p.commentsCount,
      createdAt: p.createdAt,
      author: toPublicUser(authorMap.get(String(p.authorId))),
      likedByMe: likedSet.has(String(p._id)),
      isMine: Boolean(req.user) && String(p.authorId) === req.user!.id,
    })),
    hasMore,
    nextCursor: hasMore ? posts[posts.length - 1].createdAt : null,
  });
}));

/** منشور واحد بمعرّفه — يجعل لكل منشور رابطًا مستقلًا قابلًا للمشاركة */
router.get('/posts/:id', asyncHandler(async (req, res) => {
  const post = await Post.findOne({ _id: req.params.id, status: 'active' }).lean();
  if (!post) throw notFound('المنشور غير موجود');

  const [author, myLike] = await Promise.all([
    User.findById(post.authorId).select(PUBLIC_USER_FIELDS).lean(),
    req.user ? Like.findOne({ postId: post._id, userId: req.user.id }).select('_id').lean() : null,
  ]);

  res.json({
    _id: post._id,
    text: post.text,
    imageUrl: post.imageUrl,
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    createdAt: post.createdAt,
    author: toPublicUser(author),
    likedByMe: Boolean(myLike),
    isMine: Boolean(req.user) && String(post.authorId) === req.user!.id,
  });
}));

// ---------------- النشر ----------------

const createPostSchema = z.object({
  text: z.string().trim().min(1, 'اكتب شيئًا قبل النشر').max(1000, 'الحد الأقصى 1000 حرف'),
  imageUrl: z.string().url().optional().or(z.literal('')),
});

router.post('/posts', requireAuth, writeLimiter, validate(createPostSchema), asyncHandler(async (req, res) => {
  await assertActive(req.user!.id);
  const body = req.body as z.infer<typeof createPostSchema>;

  const post = await Post.create({
    authorId: new Types.ObjectId(req.user!.id),
    text: body.text,
    imageUrl: body.imageUrl || undefined,
  });

  const author = await User.findById(req.user!.id).select(PUBLIC_USER_FIELDS).lean();

  res.status(201).json({
    _id: post._id,
    text: post.text,
    imageUrl: post.imageUrl,
    likesCount: 0,
    commentsCount: 0,
    createdAt: post.createdAt,
    author: toPublicUser(author),
    likedByMe: false,
    isMine: true,
  });
}));

router.delete('/posts/:id', requireAuth, asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post || post.status === 'deleted') throw notFound('المنشور غير موجود');

  // الملكية تُتحقق في الخادم؛ إخفاء الزر في الواجهة لا يكفي
  const mine = String(post.authorId) === req.user!.id;
  if (!mine && !isModerator(req.user!.role)) throw forbidden('لا يمكنك حذف منشور غيرك');

  post.status = 'deleted';
  await post.save();
  res.status(204).send();
}));

// ---------------- الإعجاب ----------------

router.post('/posts/:id/like', requireAuth, asyncHandler(async (req, res) => {
  await assertActive(req.user!.id);
  const post = await Post.findOne({ _id: req.params.id, status: 'active' });
  if (!post) throw notFound('المنشور غير موجود');

  try {
    await Like.create({ postId: post._id, userId: new Types.ObjectId(req.user!.id) });
    // العدّاد يزيد فقط بعد نجاح الإدراج، فالفهرس الفريد يمنع التكرار
    await Post.updateOne({ _id: post._id }, { $inc: { likesCount: 1 } });
  } catch (e) {
    const err = e as { code?: number };
    // 11000 = إعجاب موجود مسبقًا؛ نعيد الحالة الراهنة بلا خطأ
    if (err.code !== 11000) throw e;
  }

  const fresh = await Post.findById(post._id).select('likesCount').lean();
  res.json({ liked: true, likesCount: fresh?.likesCount ?? 0 });
}));

router.delete('/posts/:id/like', requireAuth, asyncHandler(async (req, res) => {
  const removed = await Like.findOneAndDelete({ postId: req.params.id, userId: req.user!.id });
  if (removed) {
    await Post.updateOne({ _id: req.params.id, likesCount: { $gt: 0 } }, { $inc: { likesCount: -1 } });
  }
  const fresh = await Post.findById(req.params.id).select('likesCount').lean();
  res.json({ liked: false, likesCount: fresh?.likesCount ?? 0 });
}));

// ---------------- التعليقات ----------------

router.get('/posts/:id/comments', asyncHandler(async (req, res) => {
  const comments = await Comment.find({ postId: req.params.id, status: 'active' })
    .sort({ createdAt: 1 }).limit(100).lean();

  const authors = await User.find({ _id: { $in: comments.map((c) => c.authorId) } })
    .select(PUBLIC_USER_FIELDS).lean();
  const map = new Map(authors.map((a) => [String(a._id), a]));

  res.json({
    items: comments.map((c) => ({
      _id: c._id,
      text: c.text,
      createdAt: c.createdAt,
      author: toPublicUser(map.get(String(c.authorId))),
      isMine: Boolean(req.user) && String(c.authorId) === req.user!.id,
    })),
  });
}));

const commentSchema = z.object({
  text: z.string().trim().min(1, 'اكتب تعليقًا').max(500, 'الحد الأقصى 500 حرف'),
});

router.post('/posts/:id/comments', requireAuth, writeLimiter, validate(commentSchema), asyncHandler(async (req, res) => {
  await assertActive(req.user!.id);
  const post = await Post.findOne({ _id: req.params.id, status: 'active' });
  if (!post) throw notFound('المنشور غير موجود');

  const comment = await Comment.create({
    postId: post._id,
    authorId: new Types.ObjectId(req.user!.id),
    text: (req.body as z.infer<typeof commentSchema>).text,
  });
  await Post.updateOne({ _id: post._id }, { $inc: { commentsCount: 1 } });

  const author = await User.findById(req.user!.id).select(PUBLIC_USER_FIELDS).lean();

  res.status(201).json({
    _id: comment._id,
    text: comment.text,
    createdAt: comment.createdAt,
    author: toPublicUser(author),
    isMine: true,
  });
}));

router.delete('/comments/:id', requireAuth, asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment || comment.status === 'deleted') throw notFound('التعليق غير موجود');

  const mine = String(comment.authorId) === req.user!.id;
  if (!mine && !isModerator(req.user!.role)) throw forbidden('لا يمكنك حذف تعليق غيرك');

  comment.status = 'deleted';
  await comment.save();
  await Post.updateOne({ _id: comment.postId, commentsCount: { $gt: 0 } }, { $inc: { commentsCount: -1 } });
  res.status(204).send();
}));

// ---------------- البلاغات ----------------

const reportSchema = z.object({
  targetType: z.enum(['post', 'comment']),
  targetId: z.string().min(1),
  reason: z.enum(['violation', 'abuse', 'spam', 'inappropriate', 'other']),
  note: z.string().max(300).optional(),
});

router.post('/reports', requireAuth, writeLimiter, validate(reportSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof reportSchema>;

  const exists = body.targetType === 'post'
    ? await Post.exists({ _id: body.targetId })
    : await Comment.exists({ _id: body.targetId });
  if (!exists) throw notFound('العنصر غير موجود');

  try {
    await Report.create({ ...body, reporterId: new Types.ObjectId(req.user!.id) });
    if (body.targetType === 'post') {
      await Post.updateOne({ _id: body.targetId }, { $inc: { reportsCount: 1 } });
    } else {
      await Comment.updateOne({ _id: body.targetId }, { $inc: { reportsCount: 1 } });
    }
  } catch (e) {
    const err = e as { code?: number };
    if (err.code === 11000) throw badRequest('سبق أن أبلغت عن هذا المحتوى');
    throw e;
  }

  res.status(201).json({ message: 'تم استلام البلاغ وسيراجعه فريق رواء' });
}));

// ---------------- الملف الشخصي ----------------

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const me = await User.findById(req.user!.id).select(`${PUBLIC_USER_FIELDS} status`).lean();
  if (!me) throw notFound();
  const postsCount = await Post.countDocuments({ authorId: req.user!.id, status: 'active' });
  res.json({ ...toPublicUser(me), status: me.status, postsCount });
}));

router.patch('/me', requireAuth, validate(z.object({
  displayName: z.string().trim().min(2).max(60).optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
})), asyncHandler(async (req, res) => {
  const updated = await User.findByIdAndUpdate(req.user!.id, req.body, { new: true })
    .select(PUBLIC_USER_FIELDS).lean();
  res.json(toPublicUser(updated));
}));

export default router;
