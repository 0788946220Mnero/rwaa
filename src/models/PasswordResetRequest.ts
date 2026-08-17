import { Schema, model, Types, Document } from 'mongoose';

export interface IPasswordResetRequest extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  phone: string;
  /** الكود لا يُخزَّن نصًا — فقط بصمته */
  codeHash?: string;
  codeIssuedAt?: Date;
  expiresAt?: Date;
  usedAt?: Date;
  attempts: number;
  status: 'pending' | 'code_issued' | 'used' | 'expired' | 'cancelled';
  issuedBy?: Types.ObjectId;
  createdAt: Date;
}

const schema = new Schema<IPasswordResetRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    phone: { type: String, required: true, index: true },
    codeHash: { type: String, select: false },
    codeIssuedAt: Date,
    expiresAt: Date,
    usedAt: Date,
    // عدّاد محاولات التخمين — يُغلق الطلب عند تجاوز الحد
    attempts: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'code_issued', 'used', 'expired', 'cancelled'],
      default: 'pending',
      index: true,
    },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

schema.index({ status: 1, createdAt: -1 });

export const PasswordResetRequest = model<IPasswordResetRequest>('PasswordResetRequest', schema);
