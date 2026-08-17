import { Schema, model, Document } from 'mongoose';
import { BusinessType, I18nText } from '../shared';
import { i18nField } from './_shared';

export interface IService extends Document {
  code: string;
  businessType: BusinessType;
  name: I18nText;
  description: I18nText;
  price: number;
  isFree: boolean;
  imageUrl?: string;
  sortOrder: number;
  isActive: boolean;
}

const serviceSchema = new Schema<IService>(
  {
    code: { type: String, required: true, unique: true, trim: true },
    businessType: { type: String, enum: ['restaurant', 'fashion'], required: true, index: true },
    name: i18nField(),
    description: i18nField(),
    // السعر مصدره الوحيد قاعدة البيانات — ممنوع تثبيته في الفرونت إند
    price: { type: Number, required: true, min: 0, default: 0 },
    isFree: { type: Boolean, default: false },
    imageUrl: { type: String },
    sortOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Service = model<IService>('Service', serviceSchema);
