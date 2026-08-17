import { createApp } from './app';
import { connectDB, disconnectDB } from './config/db';
import { env } from './config/env';
import { logger } from './utils/logger';

async function bootstrap() {
  await connectDB();
  const app = createApp();

  const server = app.listen(env.port, () => {
    logger.info(`رواء API يعمل على المنفذ ${env.port} — البيئة: ${env.nodeEnv}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`إيقاف الخادم (${signal})...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((e) => {
  logger.error('فشل إقلاع الخادم', e);
  process.exit(1);
});
