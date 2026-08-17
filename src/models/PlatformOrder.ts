import { Schema, model, Types, Document } from 'mongoose';
import { PlatformOrderStatus } from '../shared';

export type PaymentStatus = 'unpaid' | 'paid';

export interface IPlatformOrder extends Document {
  orderNumber: string;
  customer: {
    name: string; phone: string; email?: string;
    businessName: string; businessType: 'restaurant' | 'fashion';
    city?: string; notes?: string;
  };
  items: { serviceId: Types.ObjectId; code: string; nameAr: string; nameEn: string; price: number }[];
  subtotal: number;
  discountCode?: string;
  discountPercent: number;
  discountAmount: number;
  representativeId?: Types.ObjectId;
  representativeName?: string;
  total: number;
  monthlyFee: number;
  status: PlatformOrderStatus;
  statusHistory: { status: PlatformOrderStatus; at: Date; byUserId?: Types.ObjectId }[];

  // ---------- الدفع: نظام مستقل تمامًا عن حالة الطلب (البند 70) ----------
  paymentStatus: PaymentStatus;
  paidAt?: Date;
  paidBy?: Types.ObjectId;
  paymentStatusUpdatedAt?: Date;
  /** مهيّأ للتوسع لاحقًا: cash | bank_transfer | card | wallet (البند 82) */
  paymentMethod?: string;

  provisionedBusinessId?: Types.ObjectId;
}

const orderSchema = new Schema<IPlatformOrder>(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    customer: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true, index: true },
      email: { type: String, lowercase: true, trim: true },
      businessName: { type: String, required: true, trim: true },
      businessType: { type: String, enum: ['restaurant', 'fashion'], required: true },
      city: String,
      notes: String,
    },
    items: [{
      _id: false,
      serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
      code: String,
      // لقطة الاسم والسعر وقت الطلب — تغيير السعر لاحقًا لا يغيّر الطلبات القديمة
      nameAr: String,
      nameEn: String,
      price: { type: Number, required: true },
    }],
    subtotal: { type: Number, required: true },
    discountCode: String,
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    representativeId: { type: Schema.Types.ObjectId, ref: 'Representative', index: true },
    representativeName: String,
    total: { type: Number, required: true },
    monthlyFee: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['new', 'contacted', 'in_progress', 'completed', 'cancelled'],
      default: 'new',
      index: true,
    },
    statusHistory: [{
      _id: false,
      status: String,
      at: { type: Date, default: Date.now },
      byUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    }],

    paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid', index: true },
    paidAt: Date,
    paidBy: { type: Schema.Types.ObjectId, ref: 'User' },
    paymentStatusUpdatedAt: Date,
    paymentMethod: String,

    provisionedBusinessId: { type: Schema.Types.ObjectId, ref: 'Business' },
  },
  { timestamps: true },
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });

export const PlatformOrder = model<IPlatformOrder>('PlatformOrder', orderSchema);
