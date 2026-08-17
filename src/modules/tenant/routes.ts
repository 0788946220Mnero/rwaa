import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Business } from '../../models/Business';
import { Category } from '../../models/Category';
import { Product } from '../../models/Product';
import { Customer } from '../../models/Customer';
import { Order } from '../../models/Order';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth, tenantScope } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { i18nSchema } from '../../lib/crudFactory';
import { audit } from '../../lib/audit';
import { badRequest, notFound } from '../../utils/errors';

// mergeParams ضروري للوصول إلى :businessId من المسار الأب
const router = Router({ mergeParams: true });

// كل ما تحت هذا المسار يمر بحارس العزل — لا استثناء
router.use(requireAuth, tenantScope);

const bid = (req: { params: Record<string, string> }) => new Types.ObjectId(req.params.businessId);

// ---------------- النشاط نفسه ----------------

router.get('/', asyncHandler(async (req, res) => {
  const business = await Business.findById(bid(req)).lean();
  if (!business) throw notFound('النشاط غير موجود');
  res.json(business);
}));

/** حالة المطعم: مفتوح / مشغول / مغلق / متوقف مؤقتًا */
router.patch('/status', validate(z.object({
  status: z.enum(['open', 'busy', 'closed', 'paused']),
  statusMessage: i18nSchema.optional(),
})), asyncHandler(async (req, res) => {
  const updated = await Business.findByIdAndUpdate(bid(req), req.body, { new: true });
  if (!updated) throw notFound('النشاط غير موجود');
  await audit(req, { action: 'update_status', resource: 'business', resourceId: req.params.businessId, after: req.body });
  res.json(updated);
}));

router.patch('/settings', validate(z.object({ settings: z.record(z.unknown()) })), asyncHandler(async (req, res) => {
  const business = await Business.findById(bid(req));
  if (!business) throw notFound('النشاط غير موجود');
  business.set('settings', { ...business.settings, ...(req.body.settings as object) });
  await business.save();
  res.json(business);
}));

// ---------------- الفئات ----------------

const categorySchema = z.object({
  name: i18nSchema,
  description: i18nSchema.optional(),
  imageUrl: z.string().optional(),
  sortOrder: z.number().optional(),
  isVisible: z.boolean().optional(),
});

router.get('/categories', asyncHandler(async (req, res) => {
  const items = await Category.find({ businessId: bid(req) }).sort('sortOrder').lean();
  res.json({ items });
}));

router.post('/categories', validate(categorySchema), asyncHandler(async (req, res) => {
  const created = await Category.create({ ...req.body, businessId: bid(req) });
  res.status(201).json(created);
}));

router.patch('/categories/:id', validate(categorySchema.partial()), asyncHandler(async (req, res) => {
  // الفلتر يتضمن businessId دائمًا — يمنع تعديل فئة تخص نشاطًا آخر
  const updated = await Category.findOneAndUpdate(
    { _id: req.params.id, businessId: bid(req) }, req.body, { new: true, runValidators: true },
  );
  if (!updated) throw notFound('الفئة غير موجودة');
  res.json(updated);
}));

router.delete('/categories/:id', asyncHandler(async (req, res) => {
  const count = await Product.countDocuments({ categoryId: req.params.id, businessId: bid(req) });
  if (count > 0) throw badRequest(`لا يمكن حذف الفئة لاحتوائها على ${count} منتجًا. انقلها أو احذفها أولًا.`);
  const deleted = await Category.findOneAndDelete({ _id: req.params.id, businessId: bid(req) });
  if (!deleted) throw notFound('الفئة غير موجودة');
  res.status(204).send();
}));

// ---------------- المنتجات ----------------

const productSchema = z.object({
  categoryId: z.string().optional(),
  name: i18nSchema,
  description: i18nSchema.optional(),
  price: z.number().min(0),
  compareAtPrice: z.number().min(0).optional(),
  images: z.array(z.string()).optional(),
  sku: z.string().optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: z.number().optional(),
  options: z.array(z.object({
    name: i18nSchema,
    type: z.enum(['single', 'multi']).optional(),
    required: z.boolean().optional(),
    choices: z.array(z.object({ name: i18nSchema, priceDelta: z.number() })).optional(),
  })).optional(),
  variants: z.array(z.object({
    size: z.string().optional(), color: z.string().optional(), colorHex: z.string().optional(),
    stock: z.number().optional(), sku: z.string().optional(), priceDelta: z.number().optional(),
  })).optional(),
  trackInventory: z.boolean().optional(),
  stock: z.number().optional(),
});

router.get('/products', asyncHandler(async (req, res) => {
  const filter: Record<string, unknown> = { businessId: bid(req) };
  if (req.query.categoryId) filter.categoryId = req.query.categoryId;
  const items = await Product.find(filter).sort('sortOrder').lean();
  res.json({ items });
}));

router.post('/products', validate(productSchema), asyncHandler(async (req, res) => {
  const created = await Product.create({ ...req.body, businessId: bid(req) });
  res.status(201).json(created);
}));

router.patch('/products/:id', validate(productSchema.partial()), asyncHandler(async (req, res) => {
  const updated = await Product.findOneAndUpdate(
    { _id: req.params.id, businessId: bid(req) }, req.body, { new: true, runValidators: true },
  );
  if (!updated) throw notFound('المنتج غير موجود');
  res.json(updated);
}));

/** إيقاف / تشغيل صنف بسرعة من شاشة الكاشير */
router.patch('/products/:id/availability', validate(z.object({ isAvailable: z.boolean() })), asyncHandler(async (req, res) => {
  const updated = await Product.findOneAndUpdate(
    { _id: req.params.id, businessId: bid(req) },
    { isAvailable: req.body.isAvailable }, { new: true },
  );
  if (!updated) throw notFound('المنتج غير موجود');
  res.json(updated);
}));

router.delete('/products/:id', asyncHandler(async (req, res) => {
  const deleted = await Product.findOneAndDelete({ _id: req.params.id, businessId: bid(req) });
  if (!deleted) throw notFound('المنتج غير موجود');
  res.status(204).send();
}));

// ---------------- العملاء ----------------

router.get('/customers', asyncHandler(async (req, res) => {
  const items = await Customer.find({ businessId: bid(req) }).sort('-lastOrderAt').limit(200).lean();
  res.json({ items });
}));

router.patch('/customers/:id/block', validate(z.object({
  isBlocked: z.boolean(), blockReason: z.string().optional(),
})), asyncHandler(async (req, res) => {
  const updated = await Customer.findOneAndUpdate(
    { _id: req.params.id, businessId: bid(req) }, req.body, { new: true },
  );
  if (!updated) throw notFound('العميل غير موجود');
  res.json(updated);
}));

// ---------------- الطلبات ----------------

router.get('/orders', asyncHandler(async (req, res) => {
  const filter: Record<string, unknown> = { businessId: bid(req) };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.unprintedOnly === 'true') filter['print.printed'] = false;
  // للاستقصاء الدوري: أعطني ما استجدّ فقط
  if (req.query.since) {
    const since = new Date(String(req.query.since));
    if (!Number.isNaN(since.getTime())) filter.createdAt = { $gt: since };
  }

  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const [items, newCount, unprintedCount] = await Promise.all([
    Order.find(filter).sort('-createdAt').limit(limit).lean(),
    Order.countDocuments({ businessId: bid(req), status: 'new' }),
    Order.countDocuments({ businessId: bid(req), 'print.printed': false, status: { $ne: 'cancelled' } }),
  ]);
  res.json({ items, newCount, unprintedCount, serverTime: new Date().toISOString() });
}));

router.get('/orders/:id', asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, businessId: bid(req) }).lean();
  if (!order) throw notFound('الطلب غير موجود');
  res.json(order);
}));

router.patch('/orders/:id/status', validate(z.object({
  status: z.enum(['new', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']),
})), asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, businessId: bid(req) });
  if (!order) throw notFound('الطلب غير موجود');
  order.status = req.body.status;
  order.statusHistory.push({ status: req.body.status, at: new Date(), byUserId: new Types.ObjectId(req.user!.id) });
  await order.save();
  res.json(order);
}));

/**
 * تأكيد الطباعة — يُستدعى من لوحة الكاشير بعد نجاح QZ Tray فقط.
 * الفشل يُسجَّل دون وضع علامة "مطبوع"، فلا يضيع الطلب ولا يُعتبر منجزًا.
 */
router.patch('/orders/:id/print', validate(z.object({
  success: z.boolean(),
  error: z.string().max(300).optional(),
})), asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, businessId: bid(req) });
  if (!order) throw notFound('الطلب غير موجود');

  const now = new Date();
  order.print.lastAttemptAt = now;

  if (req.body.success) {
    order.print.printed = true;
    order.print.printedAt = order.print.printedAt ?? now;
    order.print.printCount += 1;
    order.print.lastError = undefined;
  } else {
    order.print.lastError = req.body.error ?? 'خطأ غير معروف';
  }

  await order.save();
  res.json(order);
}));

export default router;
