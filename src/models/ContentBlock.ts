import { Schema, model, Document } from 'mongoose';
import { I18nText } from '../shared';
import { i18nField } from './_shared';

/**
 * وحدة محتوى عامة (البند 60).
 * كل قسم في الموقع = مستند هنا، فيمكن تعديل نصوص الموقع بالكامل من لوحة التحكم
 * دون فتح المحرر ودون إعادة نشر.
 */
export interface IContentBlock extends Document {
  page: string;          // home | about | contact | demo | clients | restaurants | fashion
  key: string;           // معرّف القسم داخل الصفحة
  title: I18nText;
  subtitle: I18nText;
  description: I18nText;
  buttonText: I18nText;
  buttonUrl: string;
  imageUrl: string;
  images: string[];
  extra: Record<string, unknown>;
  sortOrder: number;
  isVisible: boolean;
}

const schema = new Schema<IContentBlock>(
  {
    page: { type: String, required: true, index: true, lowercase: true, trim: true },
    key: { type: String, required: true, trim: true },
    title: i18nField(),
    subtitle: i18nField(),
    description: i18nField(),
    buttonText: i18nField(),
    buttonUrl: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    images: { type: [String], default: [] },
    extra: { type: Schema.Types.Mixed, default: {} },
    sortOrder: { type: Number, default: 0 },
    isVisible: { type: Boolean, default: true },
  },
  { timestamps: true },
);

schema.index({ page: 1, key: 1 }, { unique: true });
schema.index({ page: 1, sortOrder: 1 });

export const ContentBlock = model<IContentBlock>('ContentBlock', schema);
