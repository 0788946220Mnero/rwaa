import { Schema, model, Types, Document } from 'mongoose';
import { BusinessType, BusinessStatus, I18nText } from '../shared';
import { i18nField } from './_shared';

/** النشاط التجاري — مطعم أو محل ألبسة. كل بيانات المستأجر تُعزل بـ businessId */
export interface IBusiness extends Document {
  _id: Types.ObjectId;
  name: I18nText;
  slug: string;
  type: BusinessType;
  ownerId?: Types.ObjectId;
  logoUrl?: string;
  heroUrl?: string;
  description: I18nText;
  contact: { phone?: string; whatsapp?: string; email?: string; address?: string; mapUrl?: string };
  status: BusinessStatus;
  statusMessage: I18nText;
  workingHours: { day: number; openTime: string; closeTime: string; isClosed: boolean }[];
  features: string[];
  settings: {
    currency: I18nText;
    deliveryFee: number;
    minOrder: number;
    taxRate: number;
    acceptsDelivery: boolean;
    acceptsPickup: boolean;
    verificationEnabled: boolean;
    /** الطباعة تُدار من جهاز الكاشير؛ هذا مفتاح تشغيل عام فقط */
    printingEnabled: boolean;
    autoPrint: boolean;
  };
  isActive: boolean;
}

const businessSchema = new Schema<IBusiness>(
  {
    name: i18nField(),
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    type: { type: String, enum: ['restaurant', 'fashion'], required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    logoUrl: String,
    heroUrl: String,
    description: i18nField(),
    contact: {
      phone: String, whatsapp: String, email: String, address: String, mapUrl: String,
    },
    status: { type: String, enum: ['open', 'busy', 'closed', 'paused'], default: 'open' },
    statusMessage: i18nField(),
    workingHours: [{
      _id: false,
      day: { type: Number, min: 0, max: 6 },
      openTime: { type: String, default: '10:00' },
      closeTime: { type: String, default: '23:00' },
      isClosed: { type: Boolean, default: false },
    }],
    features: { type: [String], default: [] },
    settings: {
      currency: i18nField(),
      deliveryFee: { type: Number, default: 0, min: 0 },
      minOrder: { type: Number, default: 0, min: 0 },
      taxRate: { type: Number, default: 0, min: 0 },
      acceptsDelivery: { type: Boolean, default: true },
      acceptsPickup: { type: Boolean, default: true },
      verificationEnabled: { type: Boolean, default: false },
      printingEnabled: { type: Boolean, default: false },
      autoPrint: { type: Boolean, default: false },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Business = model<IBusiness>('Business', businessSchema);
