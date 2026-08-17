import { Schema, model, Types, Document } from 'mongoose';

/**
 * سجل تغييرات الدفع (البند 73).
 * القيمة الحالية في الطلب لا تكفي — نحتاج من غيّرها ومتى، ولا يُحذف السجل أبدًا.
 */
export interface IPaymentStatusHistory extends Document {
  orderId: Types.ObjectId;
  orderNumber: string;
  oldStatus: string;
  newStatus: string;
  changedBy?: Types.ObjectId;
  changedByName?: string;
  note?: string;
  createdAt: Date;
}

const schema = new Schema<IPaymentStatusHistory>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'PlatformOrder', required: true, index: true },
    orderNumber: String,
    oldStatus: { type: String, required: true },
    newStatus: { type: String, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    changedByName: String,
    note: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const PaymentStatusHistory = model<IPaymentStatusHistory>('PaymentStatusHistory', schema);
