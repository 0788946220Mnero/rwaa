/**
 * تهيئة البيانات الأولية.
 * هنا فقط تعيش الأسعار الافتراضية — بعد التشغيل الأول تُدار كليًا من /admin/services.
 * آمن للتشغيل المتكرر: لا يستبدل ما عدّلته من لوحة التحكم.
 */
import { connectDB, disconnectDB } from '../config/db';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { User, hashPassword } from '../models/User';
import { Setting } from '../models/Setting';
import { Service } from '../models/Service';
import { ContentBlock } from '../models/ContentBlock';
import { ROLES, SERVICE_CODES, SETTING_KEYS } from '../shared';

const services = [
  // ---------- المطاعم ----------
  { code: SERVICE_CODES.RESTAURANT_PLATFORM, businessType: 'restaurant', price: 20, sortOrder: 0,
    name: { ar: 'منصة للمطعم', en: 'Restaurant Platform' },
    description: { ar: 'منصة رقمية مستقلة للمطعم مع استضافة ودومين.', en: 'A standalone digital platform with hosting and domain.' } },
  { code: SERVICE_CODES.RESTAURANT_MENU, businessType: 'restaurant', price: 10, sortOrder: 1,
    name: { ar: 'مينيو رقمي', en: 'Digital Menu' },
    description: { ar: 'مينيو رقمي خاص بالمطعم لعرض الأصناف والأسعار بطريقة احترافية.', en: 'A digital menu presenting items and prices professionally.' } },
  { code: SERVICE_CODES.RESTAURANT_HOME, businessType: 'restaurant', price: 5, sortOrder: 2,
    name: { ar: 'صفحة رئيسية للمطعم', en: 'Restaurant Home Page' },
    description: { ar: 'صفحة رئيسية تحتوي على معلومات المطعم وطرق التواصل والوصول إلى الخدمات.', en: 'A home page with restaurant info, contact methods and service links.' } },
  { code: SERVICE_CODES.RESTAURANT_DASHBOARD, businessType: 'restaurant', price: 25, sortOrder: 3,
    name: { ar: 'لوحة تحكم', en: 'Control Panel' },
    description: { ar: 'لوحة لإدارة الأصناف والمنتجات والصور والأسعار والتصنيفات ومعلومات المطعم.', en: 'Manage items, products, images, prices, categories and restaurant info.' } },
  { code: SERVICE_CODES.RESTAURANT_ORDERING, businessType: 'restaurant', price: 45, sortOrder: 4,
    name: { ar: 'نظام طلب مباشر', en: 'Direct Ordering System' },
    description: { ar: 'يدخل العميل رابط المطعم، يختار المنتجات ويرسل الطلب فيصل مباشرة إلى المطعم ويُطبع على الكاشير — بديل عملي عن غرفة الكول سنتر.', en: 'Customers order from your link and orders arrive directly at the restaurant and print at the cashier — a practical alternative to a call center.' } },
  { code: SERVICE_CODES.RESTAURANT_BANNER, businessType: 'restaurant', price: 0, isFree: true, sortOrder: 5,
    name: { ar: 'بانر العروض والإعلانات', en: 'Offers & Ads Banner' },
    description: { ar: 'بانر ذكي داخل موقع المطعم يُدار بالكامل من لوحة التحكم.', en: 'A smart banner inside your site, fully managed from the dashboard.' } },
  { code: SERVICE_CODES.RESTAURANT_VERIFY, businessType: 'restaurant', price: 0, isFree: true, sortOrder: 6,
    name: { ar: 'توثيق العملاء', en: 'Customer Verification' },
    description: { ar: 'مجاني مع نظام الطلب المباشر — يقلل الطلبات الوهمية.', en: 'Free with direct ordering — reduces fake orders.' } },
  { code: SERVICE_CODES.RESTAURANT_QR, businessType: 'restaurant', price: 0, isFree: true, sortOrder: 7,
    name: { ar: 'رمز QR', en: 'QR Code' },
    description: { ar: 'رمز QR قابل للتحميل والطباعة يوصل إلى المينيو والطلب المباشر.', en: 'A downloadable, printable QR code linking to your menu and ordering.' } },

  // ---------- الألبسة ----------
  { code: SERVICE_CODES.FASHION_HOME, businessType: 'fashion', price: 15, sortOrder: 0,
    name: { ar: 'الصفحة الرئيسية', en: 'Home Page' },
    description: { ar: 'صفحة رئيسية مع خلفية وشعار وأزرار ومعلومات المحل.', en: 'Home page with background, logo, buttons and store info.' } },
  { code: SERVICE_CODES.FASHION_PRODUCTS, businessType: 'fashion', price: 25, sortOrder: 1,
    name: { ar: 'منصة المنتجات', en: 'Products Platform' },
    description: { ar: 'فئات ومنتجات بمقاسات وألوان وصور ومخزون، مع طلب مباشر وسلة موحّدة.', en: 'Categories and products with sizes, colors, images and stock, plus direct ordering.' } },
  { code: SERVICE_CODES.FASHION_DASHBOARD, businessType: 'fashion', price: 20, sortOrder: 2,
    name: { ar: 'لوحة التحكم', en: 'Control Panel' },
    description: { ar: 'إدارة المنتجات والفئات والصور والمقاسات والألوان والمخزون والطلبات والعملاء.', en: 'Manage products, categories, images, sizes, colors, stock, orders and customers.' } },
  { code: SERVICE_CODES.FASHION_BANNER, businessType: 'fashion', price: 0, isFree: true, sortOrder: 3,
    name: { ar: 'بانر ذكي', en: 'Smart Banner' },
    description: { ar: 'بانر فوق أزرار الفئات لعرض العروض والمنتجات الجديدة والتخفيضات.', en: 'A banner above the category buttons for offers, new arrivals and sales.' } },
  { code: SERVICE_CODES.FASHION_VERIFY, businessType: 'fashion', price: 0, isFree: true, sortOrder: 4,
    name: { ar: 'توثيق العملاء', en: 'Customer Verification' },
    description: { ar: 'توثيق العميل عبر رقم الهاتف لتقليل الطلبات الوهمية.', en: 'Phone-based verification to reduce fake orders.' } },
] as const;

const settings = [
  { key: SETTING_KEYS.LOGO, value: '', group: 'brand' },
  { key: SETTING_KEYS.HERO_BACKGROUND, value: '', group: 'brand' },
  { key: SETTING_KEYS.HERO_TITLE, value: { ar: 'رواء | منصة التجارة الرقمية', en: 'RAWAA | Digital Commerce Platform' }, group: 'home' },
  { key: SETTING_KEYS.HERO_SUBTITLE, value: { ar: 'نبني لمطعمك أو متجرك منصة رقمية متكاملة مع نظام طلب مباشر يصل إلى الكاشير.', en: 'A complete digital platform for your restaurant or store, with orders that reach the cashier directly.' }, group: 'home' },
  { key: SETTING_KEYS.ABOUT_CONTENT, value: { ar: '', en: '' }, group: 'pages' },
  { key: SETTING_KEYS.CONTACT_PHONE, value: '', group: 'contact' },
  { key: SETTING_KEYS.CONTACT_WHATSAPP, value: '', group: 'contact' },
  { key: SETTING_KEYS.CONTACT_EMAIL, value: '', group: 'contact' },
  { key: SETTING_KEYS.SOCIAL, value: { instagram: '', facebook: '', tiktok: '', linkedin: '' }, group: 'contact' },
  { key: SETTING_KEYS.DEFAULT_WHATSAPP_MESSAGE, value: { ar: 'مرحبًا، أرغب بالاستفسار عن خدمات رواء.', en: 'Hello, I would like to ask about RAWAA services.' }, group: 'contact' },
  // الرسوم الشهرية — قابلة للتعديل، وغير مثبّتة في أي مكان آخر
  { key: SETTING_KEYS.MONTHLY_FEE_RESTAURANT, value: 10, group: 'pricing' },
  { key: SETTING_KEYS.MONTHLY_FEE_FASHION, value: 10, group: 'pricing' },
  { key: SETTING_KEYS.CURRENCY, value: { ar: 'دينار', en: 'JOD' }, group: 'pricing' },

  // ---- إعدادات الدفع (البند 72) ----
  { key: 'paymentSystemEnabled', value: true, group: 'payment' },
  { key: 'allowManualPaymentChange', value: true, group: 'payment' },
  { key: 'defaultPaymentStatus', value: 'unpaid', group: 'payment' },
  { key: 'showPaymentOnInvoice', value: true, group: 'payment' },
  { key: 'showPaymentInOrders', value: true, group: 'payment' },

  // ---- SEO (البند 63) ----
  { key: 'seoTitle', value: { ar: 'رواء | منصة التجارة الرقمية', en: 'RAWAA | Digital Commerce Platform' }, group: 'seo' },
  { key: 'seoDescription', value: { ar: 'منصة رقمية لبناء مواقع المطاعم ومحلات الألبسة في الأردن مع نظام طلب مباشر يصل إلى الكاشير.', en: 'Digital platform for Jordanian restaurants and fashion stores with direct ordering that reaches the cashier.' }, group: 'seo' },
  { key: 'seoKeywords', value: { ar: '', en: '' }, group: 'seo' },
  { key: 'ogImage', value: '', group: 'seo' },
  { key: 'favicon', value: '', group: 'seo' },
  { key: 'shareTitle', value: { ar: '', en: '' }, group: 'seo' },
  { key: 'shareDescription', value: { ar: '', en: '' }, group: 'seo' },

  // ---- الطباعة (البند 61) ----
  { key: 'printingEnabled', value: false, group: 'printing' },
  { key: 'printerName', value: '', group: 'printing' },
  { key: 'paperWidth', value: 80, group: 'printing' },
  { key: 'invoiceHeader', value: { ar: 'رواء', en: 'RAWAA' }, group: 'printing' },
  { key: 'invoiceFooter', value: { ar: 'شكرًا لكم', en: 'Thank You' }, group: 'printing' },

  // ---- الوسائط ----
  { key: 'allowedImageTypes', value: ['image/jpeg', 'image/png', 'image/webp'], group: 'media' },
  { key: 'maxImageSizeMB', value: 5, group: 'media' },

  // ---- العلامة ----
  { key: 'brandNameAr', value: 'رواء', group: 'brand' },
  { key: 'brandNameEn', value: 'RAWAA', group: 'brand' },
];

/** أقسام المحتوى — كل نص هنا يصبح قابلًا للتعديل من /admin/content (البنود 51–60) */
const content = [
  { page: 'home', key: 'hero', sortOrder: 0,
    title: { ar: 'رواء | منصة التجارة الرقمية', en: 'RAWAA | Digital Commerce Platform' },
    subtitle: { ar: 'نبني لمطعمك أو متجرك منصة رقمية متكاملة.', en: 'A complete digital platform for your restaurant or store.' },
    description: { ar: 'نظام طلب مباشر يصل إلى المطعم ويُطبع على الكاشير — بديل عملي عن غرفة الكول سنتر.', en: 'Direct ordering that reaches the restaurant and prints at the cashier — a practical alternative to a call center.' } },
  { page: 'home', key: 'btn_start', sortOrder: 1, buttonText: { ar: 'ابدأ', en: 'Get Started' }, buttonUrl: '/start' },
  { page: 'home', key: 'btn_clients', sortOrder: 2, buttonText: { ar: 'عملاؤنا', en: 'Our Clients' }, buttonUrl: '/clients' },
  { page: 'home', key: 'btn_demo', sortOrder: 3, buttonText: { ar: 'اطلب التجربة', en: 'Request a Demo' }, buttonUrl: '/demo' },
  { page: 'home', key: 'btn_about', sortOrder: 4, buttonText: { ar: 'نبذة', en: 'About' }, buttonUrl: '/about' },
  { page: 'home', key: 'btn_contact', sortOrder: 5, buttonText: { ar: 'تواصل مباشر مع المطور', en: 'Contact the Developer' }, buttonUrl: '/contact' },

  { page: 'about', key: 'intro', sortOrder: 0, title: { ar: 'نبذة عن رواء', en: 'About RAWAA' }, description: { ar: '', en: '' } },
  { page: 'about', key: 'vision', sortOrder: 1, title: { ar: 'رؤيتنا', en: 'Our Vision' }, description: { ar: '', en: '' } },
  { page: 'about', key: 'mission', sortOrder: 2, title: { ar: 'رسالتنا', en: 'Our Mission' }, description: { ar: '', en: '' } },
  { page: 'about', key: 'offer', sortOrder: 3, title: { ar: 'ماذا نقدم', en: 'What We Offer' }, description: { ar: '', en: '' } },
  { page: 'about', key: 'why', sortOrder: 4, title: { ar: 'لماذا رواء', en: 'Why RAWAA' }, description: { ar: '', en: '' } },

  { page: 'clients', key: 'header', sortOrder: 0, title: { ar: 'عملاؤنا', en: 'Our Clients' }, subtitle: { ar: 'علامات تجارية أردنية تثق برواء.', en: 'Jordanian brands that trust RAWAA.' } },

  { page: 'demo', key: 'header', sortOrder: 0,
    title: { ar: 'اطلب التجربة', en: 'Request a Demo' },
    subtitle: { ar: 'جرّب نظام الطلب المباشر والطباعة قبل الشراء.', en: 'Try direct ordering and printing before you buy.' },
    description: { ar: 'الطلب يصل مباشرة إلى المطعم ويُطبع على نظام الكاشير، دون الحاجة إلى موظف لاستقبال المكالمات.', en: 'Orders arrive directly at the restaurant and print at the cashier, with no call-taking staff required.' } },

  { page: 'contact', key: 'header', sortOrder: 0, title: { ar: 'تواصل مباشر مع المطور', en: 'Contact the Developer' }, subtitle: { ar: '', en: '' } },
  { page: 'contact', key: 'hours', sortOrder: 1, title: { ar: 'ساعات التواصل', en: 'Contact Hours' }, description: { ar: '', en: '' } },

  { page: 'restaurants', key: 'header', sortOrder: 0, title: { ar: 'باقة المطاعم', en: 'Restaurant Package' }, subtitle: { ar: 'اختر الميزات التي تحتاجها وأضفها إلى السلة.', en: 'Pick the features you need and add them to your cart.' } },
  { page: 'fashion', key: 'header', sortOrder: 0, title: { ar: 'باقة محلات الألبسة', en: 'Fashion Store Package' }, subtitle: { ar: 'اختر الميزات التي تحتاجها وأضفها إلى السلة.', en: 'Pick the features you need and add them to your cart.' } },
];

async function seed() {
  await connectDB();

  // 1) مدير المنصة
  const existingAdmin = await User.findOne({ email: env.seed.email });
  if (!existingAdmin) {
    await User.create({
      name: env.seed.name,
      email: env.seed.email,
      passwordHash: await hashPassword(env.seed.password),
      role: ROLES.PLATFORM_ADMIN,
    });
    logger.info(`أُنشئ مدير المنصة: ${env.seed.email}`);
    if (env.seed.password === 'ChangeMe123!') {
      logger.warn('كلمة المرور الافتراضية مستخدمة — غيّرها فورًا بعد أول دخول');
    }
  } else {
    logger.info('مدير المنصة موجود مسبقًا — تم التخطي');
  }

  // 2) الإعدادات (لا تُستبدل القيم المعدَّلة)
  let newSettings = 0;
  for (const s of settings) {
    const r = await Setting.updateOne(
      { key: s.key },
      { $setOnInsert: { key: s.key, value: s.value, group: s.group, isPublic: true } },
      { upsert: true },
    );
    if (r.upsertedCount) newSettings++;
  }
  logger.info(`الإعدادات: ${newSettings} جديدة، ${settings.length - newSettings} موجودة`);

  // 3) الخدمات والأسعار الافتراضية
  let newServices = 0;
  for (const s of services) {
    const r = await Service.updateOne(
      { code: s.code },
      { $setOnInsert: { ...s, isFree: 'isFree' in s ? s.isFree : false, isActive: true } },
      { upsert: true },
    );
    if (r.upsertedCount) newServices++;
  }
  logger.info(`الخدمات: ${newServices} جديدة، ${services.length - newServices} موجودة`);

  // 4) أقسام المحتوى
  let newBlocks = 0;
  for (const c of content) {
    const r = await ContentBlock.updateOne(
      { page: c.page, key: c.key },
      { $setOnInsert: { ...c, isVisible: true } },
      { upsert: true },
    );
    if (r.upsertedCount) newBlocks++;
  }
  logger.info(`أقسام المحتوى: ${newBlocks} جديدة، ${content.length - newBlocks} موجودة`);

  await disconnectDB();
  logger.info('اكتملت التهيئة.');
}

seed().catch((e) => {
  logger.error('فشلت التهيئة', e);
  process.exit(1);
});
