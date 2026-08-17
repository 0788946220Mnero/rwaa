import { Schema, model, Types, Document } from 'mongoose';

export interface ILike extends Document {
  postId: Types.ObjectId;
  userId: Types.ObjectId;
  createdAt: Date;
}

const schema = new Schema<ILike>(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

/**
 * الحاجز الحقيقي ضد تكرار الإعجاب: فهرس فريد مركّب.
 * حتى لو تسابقت عدة طلبات، قاعدة البيانات ترفض الثانية —
 * لا يمكن تضخيم العدّاد من الواجهة.
 */
schema.index({ postId: 1, userId: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });

export const Like = model<ILike>('Like', schema);
