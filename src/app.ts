import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import apiRoutes from './routes';
import { errorHandler, notFoundHandler } from './middleware/error';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // Railway خلف بروكسي
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  if (!env.isProd) app.use(morgan('dev'));

  /**
   * تطبيق Capacitor يعمل داخل WebView، وأصله ليس دومين الموقع بل
   * localhost بمخططات خاصة. بدون السماح بها يُرفض كل طلب من التطبيق
   * قبل أن يصل، فيبدو وكأن الاتصال بقاعدة البيانات متوقف.
   */
  const NATIVE_APP_ORIGINS = [
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost',
    'https://localhost',
  ];

  app.use(cors({
    origin(origin, cb) {
      // السماح بالطلبات بدون Origin (Postman، السيرفر إلى السيرفر، بعض إصدارات WebView)
      if (!origin) return cb(null, true);
      if (env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) return cb(null, true);
      if (NATIVE_APP_ORIGINS.includes(origin)) return cb(null, true);
      // منافذ التطوير المحلية (localhost:5173 وغيرها)
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
      cb(new Error(`Origin غير مسموح: ${origin}`));
    },
    credentials: true,
  }));

  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  app.use('/api', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
