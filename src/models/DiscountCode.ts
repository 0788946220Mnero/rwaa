import { Schema, model, Types, Document } from 'mongoose';

export interface IDiscountCode extends Document {
  code: string;
  representativeId?: Types.ObjectId;
  discountPercent: number;
  maxUses: number | null;
  usedCount: number;
  startsAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
}

const codeSchema = new Schema<IDiscountCode>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    representativeId: { type: Schema.Types.ObjectId, ref: 'Representative', index: true },
    discountPercent: { type: Number, required: true, min: 0, max: 100 },
    maxUses: { type: Number, default: null },
    usedCount: { type: Number, default: 0 },
    startsAt: Date,
    expiresAt: Date,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** التحقق من صلاحية الكود — يُستدعى من الباك إند فقط عند الـ checkout */
codeSchema.methods.isUsable = function (): boolean {
  const now = new Date();
  if (!this.isActive) return false;
  if (this.startsAt && now < this.startsAt) return false;
  if (this.expiresAt && now > this.expiresAt) return false;
  if (this.maxUses !== null && this.usedCount >= this.maxUses) return false;
  return true;
};

export const DiscountCode = model<IDiscountCode>('DiscountCode', codeSchema);
