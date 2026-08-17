import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

export async function connectDB(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, { autoIndex: !env.isProd });
  logger.info('MongoDB متصل');

  mongoose.connection.on('error', (e) => logger.error('خطأ في MongoDB', e));
  mongoose.connection.on('disconnected', () => logger.warn('انقطع الاتصال بـ MongoDB'));
}

export async function disconnectDB(): Promise<void> {
  await mongoose.connection.close();
}
