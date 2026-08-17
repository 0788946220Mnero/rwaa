import { Schema, model, Types, Document } from 'mongoose';
import { I18nText } from '../shared';
import { i18nField } from './_shared';

export interface IProductOptionChoice { name: I18nText; priceDelta: number }
export interface IProductOption {
  name: I18nText;
  type: 'single' | 'multi';
  required: boolean;
  choices: IProductOptionChoice[];
}

export interface IProduct extends Document {
  businessId: Types.ObjectId;
  categoryId?: Types.ObjectId;
  name: I18nText;
  description: I18nText;
  price: number;
  compareAtPrice?: number;
  images: string[];
  sku?: string;
  isAvailable: boolean;
  sortOrder: number;
  options: IProductOption[];
  /** للألبسة */
  variants: { size?: string; color?: string; colorHex?: string; stock: number; sku?: string; priceDelta: number }[];
  trackInventory: boolean;
  stock: number;
}

const optionSchema = new Schema<IProductOption>({
  name: i18nField(),
  type: { type: String, enum: ['single', 'multi'], default: 'single' },
  required: { type: Boolean, default: false },
  choices: [{
    _id: false,
    name: i18nField(),
    priceDelta: { type: Number, default: 0 },
  }],
}, { _id: false });

const schema = new Schema<IProduct>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', index: true },
    name: i18nField(),
    description: i18nField(),
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: Number,
    images: { type: [String], default: [] },
    sku: String,
    // إيقاف الصنف يدويًا: العميل يراه لكن لا يستطيع طلبه
    isAvailable: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    options: { type: [optionSchema], default: [] },
    variants: [{
      _id: false,
      size: String, color: String, colorHex: String,
      stock: { type: Number, default: 0 },
      sku: String,
      priceDelta: { type: Number, default: 0 },
    }],
    trackInventory: { type: Boolean, default: false },
    stock: { type: Number, default: 0 },
  },
  { timestamps: true },
);

schema.index({ businessId: 1, categoryId: 1, sortOrder: 1 });

export const Product = model<IProduct>('Product', schema);
