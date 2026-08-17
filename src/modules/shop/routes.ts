import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { Business } from '../../models/Business';
import { Category } from '../../models/Category';
import { Product } from '../../models/Product';
import { Customer } from '../../models/Customer';
import { Order } from '../../models/Order';
import { nextSequence } from '../../models/Counter';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { badRequest, forbidden, notFound } from '../../utils/errors';

const router = Router();

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** واجهة المتجر العامة — القائمة كاملة حسب المعرّف (slug) */
router.get('/:slug', asyncHandler(async (req, res) => {
  const business = await Business.findOne({ slug: req.params.slug.toLowerCase(), isActive: true }).lean();
  if (!business) throw notFound('المتجر غير موجود');

  const [categories, products] = await Promise.all([
    Category.find({ businessId: business._id, isVisible: true }).sort('sortOrder').lean(),
    Product.find({ businessId: business._id }).sort('sortOrder').lean(),
  ]);

  res.json({
    business: {
      _id: business._id, name: business.name, slug: business.slug, type: business.type,
      logoUrl: business.logoUrl, heroUrl: business.heroUrl, description: business.description,
      contact: business.contact, status: business.status, statusMessage: business.statusMessage,
      workingHours: business.workingHours, settings: business.settings,
    },
    categories,
    // المنتجات غير المتوفرة تُعرض معطّلة لا تُخفى، ليعرف العميل أنها موجودة عادة
    products,
  });
}));

const orderLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false });

const createOrderSchema = z.object({
  customer: z.object({
    name: z.string().min(2, 'الاسم مطلوب'),
    phone: z.string().min(7, 'رقم الهاتف مطلوب'),
    address: z.string().max(300).optional(),
    notes: z.string().max(500).optional(),
  }),
  type: z.enum(['delivery', 'pickup', 'dine_in']).default('delivery'),
  items: z.array(z.object({
    productId: z.string(),
    qty: z.number().int().min(1).max(99),
    // نستقبل المعرّفات فقط؛ الأسعار تُجلب من قاعدة البيانات
    optionChoices: z.array(z.object({ optionIndex: z.number(), choiceIndex: z.number() })).optional(),
    size: z.string().optional(),
    color: z.string().optional(),
    notes: z.string().max(200).optional(),
  })).min(1, 'السلة فارغة'),
});

/**
 * إنشاء طلب.
 * كل المبالغ تُحسب هنا من قاعدة البيانات — ما يرسله المتصفح من أسعار يُتجاهل كليًا.
 */
router.post('/:slug/orders', orderLimiter, validate(createOrderSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof createOrderSchema>;

  const business = await Business.findOne({ slug: req.params.slug.toLowerCase(), isActive: true });
  if (!business) throw notFound('المتجر غير موجود');

  // حالة المطعم تُفحص في الخادم — إخفاء الزر في الواجهة وحده لا يكفي
  if (business.status === 'closed' || business.status === 'paused') {
    throw forbidden('المتجر لا يستقبل طلبات حاليًا');
  }
  if (body.type === 'delivery' && !business.settings.acceptsDelivery) throw badRequest('التوصيل غير متاح حاليًا');
  if (body.type === 'pickup' && !business.settings.acceptsPickup) throw badRequest('الاستلام غير متاح حاليًا');

  const phone = body.customer.phone.trim();
  const blocked = await Customer.findOne({ businessId: business._id, phone, isBlocked: true }).lean();
  if (blocked) throw forbidden('تعذّر إنشاء الطلب. يرجى التواصل مع المتجر.');

  const ids = body.items.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: ids }, businessId: business._id }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const items = body.items.map((line) => {
    const p = byId.get(line.productId);
    if (!p) throw badRequest('أحد المنتجات لم يعد متاحًا');
    if (!p.isAvailable) throw badRequest(`الصنف "${p.name.ar}" غير متوفر حاليًا`);
    if (p.trackInventory && p.stock < line.qty) throw badRequest(`الكمية المتاحة من "${p.name.ar}" غير كافية`);

    let unitPrice = p.price;
    const options: { name: string; priceDelta: number }[] = [];

    for (const sel of line.optionChoices ?? []) {
      const opt = p.options?.[sel.optionIndex];
      const choice = opt?.choices?.[sel.choiceIndex];
      if (!opt || !choice) throw badRequest('خيار غير صالح على أحد المنتجات');
      unitPrice = round2(unitPrice + (choice.priceDelta ?? 0));
      options.push({ name: choice.name.ar || choice.name.en, priceDelta: choice.priceDelta ?? 0 });
    }

    if (line.size || line.color) {
      const variant = p.variants?.find((v) => (!line.size || v.size === line.size) && (!line.color || v.color === line.color));
      if (!variant) throw badRequest('المقاس أو اللون المطلوب غير متاح');
      if (variant.stock < line.qty) throw badRequest('الكمية المتاحة غير كافية');
      unitPrice = round2(unitPrice + (variant.priceDelta ?? 0));
    }

    return {
      productId: p._id,
      nameAr: p.name.ar, nameEn: p.name.en,
      qty: line.qty,
      unitPrice,
      options,
      size: line.size, color: line.color, notes: line.notes,
      lineTotal: round2(unitPrice * line.qty),
    };
  });

  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));

  // إعدادات المتجر يحرّرها صاحب النشاط، فنطهّر الأرقام قبل الحساب
  const num = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  const minOrder = num(business.settings.minOrder);
  const feeSetting = num(business.settings.deliveryFee);
  const taxRate = num(business.settings.taxRate);

  if (minOrder > 0 && subtotal < minOrder) {
    throw badRequest(`الحد الأدنى للطلب ${minOrder.toFixed(2)}`);
  }

  const deliveryFee = body.type === 'delivery' ? round2(feeSetting) : 0;
  const tax = round2((subtotal * taxRate) / 100);
  const total = round2(subtotal + deliveryFee + tax);

  const orderNumber = await nextSequence(`order:${String(business._id)}`);

  const order = await Order.create({
    businessId: business._id,
    orderNumber,
    customer: { ...body.customer, phone },
    items,
    subtotal, deliveryFee, tax, discount: 0, total,
    type: body.type,
    status: 'new',
    statusHistory: [{ status: 'new', at: new Date() }],
    print: { printed: false, printCount: 0 },
  });

  // تحديث سجل العميل — لا يُفشل الطلب إن تعثّر
  try {
    await Customer.findOneAndUpdate(
      { businessId: business._id, phone },
      {
        $set: { name: body.customer.name, address: body.customer.address, lastOrderAt: new Date() },
        $inc: { ordersCount: 1, totalSpent: total },
        $setOnInsert: { businessId: business._id, phone },
      },
      { upsert: true },
    );
  } catch { /* تجاهل */ }

  // خصم المخزون للأصناف التي تتبع الجرد
  for (const line of items) {
    const p = byId.get(String(line.productId));
    if (p?.trackInventory) {
      await Product.updateOne({ _id: p._id, businessId: business._id }, { $inc: { stock: -line.qty } });
    }
  }

  res.status(201).json({
    _id: order._id,
    orderNumber: order.orderNumber,
    total: order.total,
    status: order.status,
    // تنبيه العميل أن التنفيذ قد يتأخر
    busy: business.status === 'busy',
  });
}));

/** تتبّع الطلب برقم الهاتف — لا يكشف طلبات غيره */
router.get('/:slug/orders/:orderNumber', asyncHandler(async (req, res) => {
  const phone = String(req.query.phone ?? '').trim();
  if (!phone) throw badRequest('رقم الهاتف مطلوب');

  const business = await Business.findOne({ slug: req.params.slug.toLowerCase() }).lean();
  if (!business) throw notFound('المتجر غير موجود');

  const order = await Order.findOne({
    businessId: business._id,
    orderNumber: Number(req.params.orderNumber),
    'customer.phone': phone,
  }).lean();
  if (!order) throw notFound('الطلب غير موجود');

  res.json({ orderNumber: order.orderNumber, status: order.status, total: order.total, createdAt: order.createdAt });
}));

export default router;
