import { Schema, model, Document } from 'mongoose';

export interface IRepresentative extends Document {
  name: string;
  phone: string;
  email?: string;
  commissionPercent: number;
  isActive: boolean;
  notes?: string;
}

const repSchema = new Schema<IRepresentative>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    commissionPercent: { type: Number, default: 0, min: 0, max: 100 },
    isActive: { type: Boolean, default: true },
    notes: String,
  },
  { timestamps: true },
);

export const Representative = model<IRepresentative>('Representative', repSchema);
