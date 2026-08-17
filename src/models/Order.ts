import { Schema, model, Types, Document } from 'mongoose';
import { OrderStatus } from '../shared';

export type OrderType = 'delivery' | 'pickup' | 'dine_in';

export interface IOrderItem {
  productId: Types.ObjectId;
  nameAr: string;
  nameEn: string;
  qty: number;
  unitPrice: number;
  options: { name: string; priceDelta: number }[];
  size?: string;
  color?: string;
  notes?: string;
  lineTotal: number;
}

export interface IOrder extends Document {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  orderNumber: number;
  customer: { name: string; phone: string; address?: string; notes?: string };
  items: IOrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  tax: number;
  total: number;
  type: OrderType;
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: Date; byUserId?: Types.ObjectId }[];

  /**
   * حالة الطباعة — منفصلة تمامًا عن حالة الطلب.
   * لا تُضبط printed=true إلا بعد نجاح فعلي من QZ Tray على جهاز الكاشير.
   */
  print: {
    printed: boolean;
    printedAt?: Date;
    printCount: number;
    lastError?: string;
    lastAttemptAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    // متسلسل لكل نشاط على حدة عبر عدّاد ذرّي
    orderNumber: { type: Number, required: true },
    customer: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      address: String,
      notes: String,
    },
    items: [{
      _id: false,
      productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
      // لقطة الاسم والسعر وقت الطلب — تغيير المنتج لاحقًا لا يغيّر الطلبات القديمة
      nameAr: String,
      nameEn: String,
      qty: { type: Number, required: true, min: 1 },
      unitPrice: { type: Number, required: true, min: 0 },
      options: [{ _id: false, name: String, priceDelta: { type: Number, default: 0 } }],
      size: String,
      color: String,
      notes: String,
      lineTotal: { type: Number, required: true },
    }],
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, required: true },
    type: { type: String, enum: ['delivery', 'pickup', 'dine_in'], default: 'delivery' },
    status: {
      type: String,
      enum: ['new', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'],
      default: 'new',
      index: true,
    },
    statusHistory: [{
      _id: false,
      status: String,
      at: { type: Date, default: Date.now },
      byUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    }],
    print: {
      printed: { type: Boolean, default: false, index: true },
      printedAt: Date,
      printCount: { type: Number, default: 0 },
      lastError: String,
      lastAttemptAt: Date,
    },
  },
  { timestamps: true },
);

orderSchema.index({ businessId: 1, orderNumber: 1 }, { unique: true });
orderSchema.index({ businessId: 1, createdAt: -1 });
// يخدم استعلام لوحة الكاشير: الطلبات غير المطبوعة أولًا
orderSchema.index({ businessId: 1, 'print.printed': 1, createdAt: -1 });

export const Order = model<IOrder>('Order', orderSchema);
