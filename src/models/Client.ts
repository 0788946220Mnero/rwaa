import { Schema, model, Document } from 'mongoose';
import { I18nText } from '../shared';
import { i18nField } from './_shared';

export interface IClient extends Document {
  name: string;
  brandName: string;
  logoUrl?: string;
  imageUrl?: string;
  description: I18nText;
  websiteUrl?: string;
  sortOrder: number;
  isActive: boolean;
}

const clientSchema = new Schema<IClient>(
  {
    name: { type: String, required: true, trim: true },
    brandName: { type: String, required: true, trim: true },
    logoUrl: String,
    imageUrl: String,
    description: i18nField(),
    websiteUrl: String,
    sortOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Client = model<IClient>('Client', clientSchema);
