import { Schema, model, Types, Document } from 'mongoose';
import { ReportReason } from '../shared';

export interface IReport extends Document {
  targetType: 'post' | 'comment';
  targetId: Types.ObjectId;
  reporterId: Types.ObjectId;
  reason: ReportReason;
  note?: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
}

const schema = new Schema<IReport>(
  {
    targetType: { type: String, enum: ['post', 'comment'], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true, index: true },
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: {
      type: String,
      enum: ['violation', 'abuse', 'spam', 'inappropriate', 'other'],
      required: true,
    },
    note: { type: String, maxlength: 300 },
    status: { type: String, enum: ['pending', 'reviewed', 'dismissed'], default: 'pending', index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// بلاغ واحد لكل مستخدم على كل عنصر
schema.index({ targetType: 1, targetId: 1, reporterId: 1 }, { unique: true });
schema.index({ status: 1, createdAt: -1 });

export const Report = model<IReport>('Report', schema);
