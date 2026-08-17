import { Schema } from 'mongoose';

const i18nSubSchema = new Schema(
  { ar: { type: String, default: '' }, en: { type: String, default: '' } },
  { _id: false },
);

/**
 * حقل نصي ثنائي اللغة قابل لإعادة الاستخدام.
 * النوع مُرخّى عمدًا لأن أنواع Mongoose للمخططات المتداخلة لا تتوافق
 * مع الواجهات المخصصة دون ضجيج لا فائدة منه.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const i18nField = (required = false): any => ({
  type: i18nSubSchema,
  required,
  default: () => ({ ar: '', en: '' }),
});
