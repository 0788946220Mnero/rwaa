import { Schema, model, Types, Document } from 'mongoose';
import { I18nText } from '../shared';
import { i18nField } from './_shared';

export interface ICategory extends Document {
  businessId: Types.ObjectId;
  name: I18nText;
  description: I18nText;
  imageUrl?: string;
  sortOrder: number;
  isVisible: boolean;
}

const schema = new Schema<ICategory>(
  {
    // إجباري دائمًا — أساس العزل بين المستأجرين
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: i18nField(),
    description: i18nField(),
    imageUrl: String,
    sortOrder: { type: Number, default: 0 },
    isVisible: { type: Boolean, default: true },
  },
  { timestamps: true },
);

schema.index({ businessId: 1, sortOrder: 1 });

export const Category = model<ICategory>('Category', schema);
