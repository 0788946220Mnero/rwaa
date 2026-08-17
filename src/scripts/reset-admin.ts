/**
 * استعادة حساب مدير المنصة من الخادم (البند 50).
 *
 * يُشغَّل على Railway عبر:
 *   npm run admin:reset -- --email admin@rawaa.jo --password "كلمة-جديدة-قوية"
 *
 * لماذا سكربت على الخادم ولا endpoint؟
 * لأن أي مسار "نسيت كلمة المرور" مكشوف على الإنترنت هو سطح هجوم على أعلى حساب في النظام.
 * الوصول إلى Railway نفسه هو التوثيق هنا — من يملكه يملك كل شيء أصلاً.
 * السكربت لا يعرض كلمة المرور الحالية لأنها غير موجودة أصلًا — المخزَّن هاش أحادي الاتجاه.
 */
import { connectDB, disconnectDB } from '../config/db';
import { User, hashPassword } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { logger } from '../utils/logger';
import { ROLES } from '../shared';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function run() {
  const email = (arg('email') ?? process.env.RESET_ADMIN_EMAIL)?.toLowerCase();
  const password = arg('password') ?? process.env.RESET_ADMIN_PASSWORD;
  const username = arg('username');

  if (!email || !password) {
    logger.error('الاستخدام: npm run admin:reset -- --email <بريد> --password <كلمة-مرور>');
    process.exit(1);
  }
  if (password.length < 10) {
    logger.error('كلمة المرور يجب أن تكون 10 أحرف على الأقل');
    process.exit(1);
  }

  await connectDB();

  let user = await User.findOne({ email });
  const passwordHash = await hashPassword(password);

  if (user) {
    user.passwordHash = passwordHash;
    user.isActive = true;
    user.role = ROLES.PLATFORM_ADMIN;
    if (username) user.username = username.toLowerCase();
    user.tokenVersion += 1; // إبطال كل الجلسات القائمة
    await user.save();
    logger.info(`أُعيد تعيين كلمة مرور: ${email} — وأُنهيت جميع جلساته`);
  } else {
    user = await User.create({
      name: arg('name') ?? 'مدير رواء',
      email,
      username: username?.toLowerCase(),
      passwordHash,
      role: ROLES.PLATFORM_ADMIN,
      isActive: true,
    });
    logger.info(`أُنشئ حساب مدير جديد: ${email}`);
  }

  await AuditLog.create({
    action: 'admin_reset_via_server',
    resource: 'user',
    resourceId: String(user._id),
    userEmail: email,
    after: { note: 'نُفِّذ من سكربت الخادم' },
  });

  await disconnectDB();
  logger.warn('غيّر كلمة المرور من لوحة التحكم بعد أول دخول، وامسح الأمر من سجل الطرفية.');
}

run().catch((e) => { logger.error('فشلت الاستعادة', e); process.exit(1); });
