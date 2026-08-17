import { Schema, model, Document } from 'mongoose';

export interface ISetting extends Document {
  key: string;
  value: unknown;
  group: string;
  isPublic: boolean;
}

const settingSchema = new Schema<ISetting>(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed },
    group: { type: String, default: 'general' },
    // isPublic=false يعني أن الإعداد لا يُرسل في الـ endpoint العام
    isPublic: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Setting = model<ISetting>('Setting', settingSchema);

/** قراءة إعداد واحد بقيمة افتراضية */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const doc = await Setting.findOne({ key }).lean();
  return (doc?.value as T) ?? fallback;
}
