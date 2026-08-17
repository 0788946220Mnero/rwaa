import { Schema, model, Types, Document } from 'mongoose';

export interface IAuditLog extends Document {
  userId?: Types.ObjectId;
  userEmail?: string;
  action: string;
  resource: string;
  resourceId?: string;
  businessId?: Types.ObjectId;
  before?: unknown;
  after?: unknown;
  ip?: string;
  createdAt: Date;
}

const auditSchema = new Schema<IAuditLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    userEmail: String,
    action: { type: String, required: true },
    resource: { type: String, required: true, index: true },
    resourceId: String,
    businessId: { type: Schema.Types.ObjectId, index: true },
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const AuditLog = model<IAuditLog>('AuditLog', auditSchema);
