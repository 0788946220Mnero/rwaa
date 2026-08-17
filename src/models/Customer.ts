import { Schema, model, Types, Document } from 'mongoose';

export interface ICustomer extends Document {
  businessId: Types.ObjectId;
  name: string;
  phone: string;
  address?: string;
  isVerified: boolean;
  isBlocked: boolean;
  blockReason?: string;
  ordersCount: number;
  totalSpent: number;
  lastOrderAt?: Date;
}

const schema = new Schema<ICustomer>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: String,
    isVerified: { type: Boolean, default: false },
    // حظر الرقم يمنع إنشاء طلبات جديدة منه (تقليل الطلبات الوهمية)
    isBlocked: { type: Boolean, default: false },
    blockReason: String,
    ordersCount: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    lastOrderAt: Date,
  },
  { timestamps: true },
);

schema.index({ businessId: 1, phone: 1 }, { unique: true });

export const Customer = model<ICustomer>('Customer', schema);
