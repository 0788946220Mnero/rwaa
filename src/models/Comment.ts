import { Schema, model, Types, Document } from 'mongoose';
import { ContentStatus } from '../shared';

export interface IComment extends Document {
  _id: Types.ObjectId;
  postId: Types.ObjectId;
  authorId: Types.ObjectId;
  text: string;
  status: ContentStatus;
  reportsCount: number;
  createdAt: Date;
}

const schema = new Schema<IComment>(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, required: true, trim: true, maxlength: 500 },
    status: { type: String, enum: ['active', 'hidden', 'deleted'], default: 'active', index: true },
    reportsCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

schema.index({ postId: 1, status: 1, createdAt: 1 });

export const Comment = model<IComment>('Comment', schema);
