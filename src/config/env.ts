import dotenv from 'dotenv';

dotenv.config();

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`متغير البيئة المطلوب مفقود: ${key}`);
  return v;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 4000),
  mongoUri: required('MONGODB_URI'),
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
    refreshTtl: process.env.REFRESH_TOKEN_TTL ?? '30d',
  },
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
    folder: process.env.CLOUDINARY_FOLDER ?? 'rawaa',
  },
  seed: {
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@rawaa.jo',
    password: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!',
    name: process.env.SEED_ADMIN_NAME ?? 'مدير رواء',
  },
};
