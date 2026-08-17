import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { PlatformOrder } from '../../models/PlatformOrder';
import { PaymentStatusHistory } from '../../models/PaymentStatusHistory';
import { Service } from '../../models/Service';
import { DiscountCode } from '../../models/DiscountCode';
import { Representative } from '../../models/Representative';
import { User } from '../../models/User';
import { getSetting } from '../../models/Setting';
import { nextSequence } from '../../models/Counter';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth, requirePlatform } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { audit } from '../../lib/audit';
import { badRequest, forbidden, notFound } from '../../utils/errors';
import { SETTING_KEYS } from '../../shared';

const router = Router();

const round2 = (n: number) => Math.round(n * 100) / 100;

/** تهريب رموز RegExp — إدخال مثل "(" في البحث كان يرمي استثناءً ويعيد 500 */
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------- إنشاء الطلب (عام) ----------------

const createSchema = z.object({
  customer: z.object({
    name: z.string().min(2, 'الاسم مطلوب'),
    phone: z.string().min(7, 'رقم الهاتف مطلوب'),
    email: z.string().email().optional().or(z.literal('')),
    businessName: z.string().min(2, 'اسم النشاط مطلوب'),
    businessType: z.enum(['restaurant', 'fashion']),
    city: z.string().optional(),
    notes: z.string().max(1000).optional(),
  }),
  serviceIds: z.array(z.string()).min(1, 'اختر خدمة واحدة على الأقل'),
  discountCode: z.string().optional(),
});

/**
 * كل المبالغ تُحسب هنا من قاعدة البيانات.
 * ما يرسله المتصفح من أسعار يُتجاهل تمامًا — هو معرّفات خدمات فقط.
 */
router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof createSchema>;

  const services = await Service.find({ _id: { $in: body.serviceIds }, isActive: true }).lean();
  if (services.length !== body.serviceIds.length) throw badRequest('بعض الخدمات لم تعد متاحة');
  if (services.some((s) => s.businessType !== body.customer.businessType)) {
    throw badRequest('الخدمات لا تطابق نوع النشاط المختار');
  }

  const items = services.map((s) => ({
    serviceId: s._id, code: s.code, nameAr: s.name.ar, nameEn: s.name.en, price: s.price,
  }));
  const subtotal = round2(items.reduce((sum, i) => sum + i.price, 0));

  // ---- الخصم ----
  let discountPercent = 0;
  let discountCodeValue: string | undefined;
  let representativeId: Types.ObjectId | undefined;
  let representativeName: string | undefined;

  if (body.discountCode?.trim()) {
    const code = await DiscountCode.findOne({ code: body.discountCode.trim().toUpperCase() });
    const now = new Date();
    const usable =
      code && code.isActive &&
      (!code.startsAt || now >= code.startsAt) &&
      (!code.expiresAt || now <= code.expiresAt) &&
      (code.maxUses === null || code.usedCount < code.maxUses);

    if (!usable) throw badRequest('كود الخصم غير صالح أو منتهي');

    discountPercent = code!.discountPercent;
    discountCodeValue = code!.code;
    representativeId = code!.representativeId as Types.ObjectId | undefined;
    if (code!.representativeId) {
      const rep = await Representative.findById(code!.representativeId).lean();
      representativeName = rep?.name;
    }
  }

  const discountAmount = round2((subtotal * discountPercent) / 100);
  const total = round2(subtotal - discountAmount);

  const rawFee = await getSetting<unknown>(
    body.customer.businessType === 'fashion'
      ? SETTING_KEYS.MONTHLY_FEE_FASHION
      : SETTING_KEYS.MONTHLY_FEE_RESTAURANT,
    0,
  );
  // الإعدادات تُحرَّر يدويًا من لوحة التحكم، فقيمة واحدة خاطئة
  // كانت تكفي لإسقاط إنشاء كل الطلبات. نطهّرها هنا بدل الوثوق بها.
  const monthlyFee = Number.isFinite(Number(rawFee)) ? round2(Number(rawFee)) : 0;

  const rawStatus = await getSetting<unknown>('defaultPaymentStatus', 'unpaid');
  const defaultPaymentStatus: 'unpaid' | 'paid' = rawStatus === 'paid' ? 'paid' : 'unpaid';

  const seq = await nextSequence('platformOrder');
  const orderNumber = `RAWAA-${1000 + seq}`;

  const order = await PlatformOrder.create({
    orderNumber,
    customer: body.customer,
    items,
    subtotal,
    discountCode: discountCodeValue,
    discountPercent,
    discountAmount,
    representativeId,
    representativeName,
    total,
    monthlyFee,
    status: 'new',
    statusHistory: [{ status: 'new', at: new Date() }],
    paymentStatus: defaultPaymentStatus,
  });

  // زيادة عدّاد الاستخدام بعد نجاح إنشاء الطلب فقط
  if (discountCodeValue) {
    await DiscountCode.updateOne({ code: discountCodeValue }, { $inc: { usedCount: 1 } });
  }

  res.status(201).json({ orderNumber: order.orderNumber, total: order.total, monthlyFee: order.monthlyFee, _id: order._id });
}));

// ---------------- الإدارة ----------------

const listQuery = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(25),
  status: z.string().optional(),
  paymentStatus: z.enum(['paid', 'unpaid']).optional(),
  q: z.string().optional(),
});

router.get('/', requireAuth, requirePlatform, validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const { page, limit, status, paymentStatus, q } = req.query as unknown as z.infer<typeof listQuery>;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (q) {
    const safe = escapeRegex(q);
    filter.$or = [
      { orderNumber: new RegExp(safe, 'i') },
      { 'customer.name': new RegExp(safe, 'i') },
      { 'customer.phone': new RegExp(safe, 'i') },
      { 'customer.businessName': new RegExp(safe, 'i') },
    ];
  }

  const [items, total, unpaidCount] = await Promise.all([
    PlatformOrder.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(limit).lean(),
    PlatformOrder.countDocuments(filter),
    PlatformOrder.countDocuments({ paymentStatus: 'unpaid' }),
  ]);
  res.json({ items, total, page, limit, unpaidCount });
}));

router.get('/stats', requireAuth, requirePlatform, asyncHandler(async (_req, res) => {
  const [byStatus, byPayment, revenue] = await Promise.all([
    PlatformOrder.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    PlatformOrder.aggregate([{ $group: { _id: '$paymentStatus', count: { $sum: 1 }, amount: { $sum: '$total' } } }]),
    PlatformOrder.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
  ]);
  res.json({ byStatus, byPayment, collectedRevenue: revenue[0]?.total ?? 0 });
}));

router.get('/:id', requireAuth, requirePlatform, asyncHandler(async (req, res) => {
  const order = await PlatformOrder.findById(req.params.id).lean();
  if (!order) throw notFound('الطلب غير موجود');
  const paymentHistory = await PaymentStatusHistory.find({ orderId: order._id }).sort('-createdAt').lean();
  res.json({ ...order, paymentHistory });
}));

router.patch('/:id/status', requireAuth, requirePlatform,
  validate(z.object({ status: z.enum(['new', 'contacted', 'in_progress', 'completed', 'cancelled']) })),
  asyncHandler(async (req, res) => {
    const order = await PlatformOrder.findById(req.params.id);
    if (!order) throw notFound('الطلب غير موجود');
    const before = order.status;
    order.status = req.body.status;
    order.statusHistory.push({ status: req.body.status, at: new Date(), byUserId: req.user!.id as never });
    await order.save();
    await audit(req, { action: 'update_order_status', resource: 'platform_order', resourceId: req.params.id, before: { status: before }, after: { status: order.status } });
    res.json(order);
  }));

/**
 * حالة الدفع — نظام منفصل تمامًا عن حالة الطلب (البند 70).
 * تغيير يدوي فقط؛ لا علاقة له بأي بوابة دفع (البند 78).
 */
router.patch('/:id/payment-status', requireAuth, requirePlatform,
  validate(z.object({
    paymentStatus: z.enum(['unpaid', 'paid']),
    note: z.string().max(300).optional(),
    paymentMethod: z.string().max(40).optional(),
  })),
  asyncHandler(async (req, res) => {
    const enabled = await getSetting<boolean>('paymentSystemEnabled', true);
    const allowManual = await getSetting<boolean>('allowManualPaymentChange', true);
    if (!enabled) throw forbidden('نظام حالة الدفع معطّل من الإعدادات');
    if (!allowManual) throw forbidden('التغيير اليدوي لحالة الدفع معطّل من الإعدادات');

    const order = await PlatformOrder.findById(req.params.id);
    if (!order) throw notFound('الطلب غير موجود');

    const oldStatus = order.paymentStatus;
    const newStatus = req.body.paymentStatus as 'paid' | 'unpaid';
    if (oldStatus === newStatus) {
      res.json(order);
      return;
    }

    const actor = await User.findById(req.user!.id).lean();
    const now = new Date();

    order.paymentStatus = newStatus;
    order.paymentStatusUpdatedAt = now;
    if (newStatus === 'paid') {
      order.paidAt = now;
      order.paidBy = new Types.ObjectId(req.user!.id);
      if (req.body.paymentMethod) order.paymentMethod = req.body.paymentMethod;
    } else {
      // الإرجاع إلى غير مدفوع يمسح بيانات التحصيل، والسجل يحفظ ما جرى
      order.paidAt = undefined;
      order.paidBy = undefined;
    }
    await order.save();

    await PaymentStatusHistory.create({
      orderId: order._id,
      orderNumber: order.orderNumber,
      oldStatus, newStatus,
      changedBy: new Types.ObjectId(req.user!.id),
      changedByName: actor?.name,
      note: req.body.note,
    });

    await audit(req, { action: 'update_payment_status', resource: 'platform_order', resourceId: req.params.id, before: { paymentStatus: oldStatus }, after: { paymentStatus: newStatus } });

    const paymentHistory = await PaymentStatusHistory.find({ orderId: order._id }).sort('-createdAt').lean();
    res.json({ ...order.toObject(), paymentHistory });
  }));

router.get('/:id/payment-history', requireAuth, requirePlatform, asyncHandler(async (req, res) => {
  const items = await PaymentStatusHistory.find({ orderId: req.params.id }).sort('-createdAt').lean();
  res.json({ items });
}));

export default router;
