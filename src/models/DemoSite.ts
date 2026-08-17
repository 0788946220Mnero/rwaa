import { Schema, model, Document } from 'mongoose';
import { I18nText } from '../shared';
import { i18nField } from './_shared';

export interface IDemoSite extends Document {
  restaurantName: string;
  logoUrl?: string;
  demoUrl: string;
  orderUrl?: string;
  description: I18nText;
  status: 'live' | 'maintenance' | 'offline';
  sortOrder: number;
  isActive: boolean;
}

const demoSiteSchema = new Schema<IDemoSite>(
  {
    restaurantName: { type: String, required: true, trim: true },
    logoUrl: String,
    demoUrl: { type: String, required: true },
    orderUrl: String,
    description: i18nField(),
    status: { type: String, enum: ['live', 'maintenance', 'offline'], default: 'live' },
    sortOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const DemoSite = model<IDemoSite>('DemoSite', demoSiteSchema);
