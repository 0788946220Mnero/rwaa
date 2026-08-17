import { Schema, model, Types, Document } from 'mongoose';
import { ContentStatus } from '../shared';

export interface IPost extends Document {
  _id: Types.ObjectId;
  authorId: Types.ObjectId;
  text: string;
  imageUrl?: string;
  status: ContentStatus;
  likesCount: number;
  commentsCount: number;
  reportsCount: number;
  hiddenBy?: Types.ObjectId;
  hiddenReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IPost>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    imageUrl: String,
    // حذف ناعم: المحتوى المخالف يبقى للمراجعة ولا يُمحى من قاعدة البيانات
    status: { type: String, enum: ['active', 'hidden', 'deleted'], default: 'active', index: true },
    // عدّادات محفوظة لتفادي عدّ الإعجابات والتعليقات في كل قراءة
    likesCount: { type: Number, default: 0, min: 0 },
    commentsCount: { type: Number, default: 0, min: 0 },
    reportsCount: { type: Number, default: 0, min: 0 },
    hiddenBy: { type: Schema.Types.ObjectId, ref: 'User' },
    hiddenReason: String,
  },
  { timestamps: true },
);

// يخدم التصفح المرقّم: الأحدث أولًا ضمن المنشورات الظاهرة
schema.index({ status: 1, createdAt: -1 });

export const Post = model<IPost>('Post', schema);
