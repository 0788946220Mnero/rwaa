import { Schema, model, Types, Document } from 'mongoose';
import { I18nText } from '../shared';
import { i18nField } from './_shared';

/** مكتبة الوسائط (البند 64) — الروابط في قاعدة البيانات، الملفات في Cloudinary */
export interface IMedia extends Document {
  publicId: string;
  url: string;
  folder: string;
  tag: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  alt: I18nText;
  businessId?: Types.ObjectId;
  uploadedBy?: Types.ObjectId;
}

const schema = new Schema<IMedia>(
  {
    publicId: { type: String, required: true, unique: true },
    url: { type: String, required: true },
    folder: { type: String, default: 'general', index: true },
    tag: { type: String, default: 'general', index: true },
    width: Number,
    height: Number,
    format: String,
    bytes: Number,
    alt: i18nField(),
    businessId: { type: Schema.Types.ObjectId, index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const Media = model<IMedia>('Media', schema);
