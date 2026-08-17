/**
 * تهيئة فهارس المجتمع.
 *
 * لماذا سكربت منفصل؟ لأن الاتصال يعمل بـ autoIndex:false في الإنتاج،
 * فالفهارس الجديدة لا تُنشأ تلقائيًا. وبدون الفهرس الفريد على (postId,userId)
 * يستطيع المستخدم تكرار الإعجاب — وهو شرط أساسي في المتطلبات.
 *
 * التشغيل:  npm run migrate:community
 * آمن للتكرار.
 */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db';
import { logger } from '../utils/logger';
import { User } from '../models/User';
import { Post } from '../models/Post';
import { Comment } from '../models/Comment';
import { Like } from '../models/Like';
import { Report } from '../models/Report';
import { PasswordResetRequest } from '../models/PasswordResetRequest';

async function dropIfExists(collection: string, index: string): Promise<void> {
  try {
    await mongoose.connection.db!.collection(collection).dropIndex(index);
    logger.info(`أُسقط الفهرس القديم ${collection}.${index}`);
  } catch {
    /* غير موجود — لا مشكلة */
  }
}

async function run() {
  await connectDB();

  // البريد صار اختياريًا (أعضاء المجتمع بلا بريد)،
  // فالفهرس الفريد القديم غير المتفرّق يمنع أكثر من مستخدم بلا بريد.
  const emailIndexes = await mongoose.connection.db!.collection('users').indexes();
  const emailIdx = emailIndexes.find((i) => i.name === 'email_1');
  if (emailIdx && !emailIdx.sparse) {
    await dropIfExists('users', 'email_1');
    logger.warn('أُعيد بناء فهرس البريد ليصبح sparse');
  }

  const models = [User, Post, Comment, Like, Report, PasswordResetRequest];
  for (const m of models) {
    await m.syncIndexes();
    logger.info(`فهارس ${m.modelName} محدَّثة`);
  }

  const likeIdx = await mongoose.connection.db!.collection('likes').indexes();
  const unique = likeIdx.find((i) => i.unique && i.key?.postId && i.key?.userId);
  logger.info(unique
    ? '✔ الفهرس الفريد للإعجابات فعّال — لا يمكن تكرار الإعجاب'
    : '⚠ لم يُنشأ الفهرس الفريد للإعجابات — راجع السجل');

  await disconnectDB();
  logger.info('اكتملت التهيئة.');
}

run().catch((e) => { logger.error('فشلت تهيئة المجتمع', e); process.exit(1); });
