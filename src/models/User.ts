import { Schema, model, Types, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES, Role } from '../shared';

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  /** الاسم الظاهر في المجتمع؛ يتراجع إلى name عند غيابه */
  displayName?: string;
  username?: string;
  email?: string;
  avatarUrl?: string;
  status: 'active' | 'suspended' | 'deleted';
  phone?: string;
  passwordHash: string;
  role: Role;
  businessId?: Types.ObjectId;
  isActive: boolean;
  lastLoginAt?: Date;
  tokenVersion: number;
  comparePassword(plain: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    displayName: { type: String, trim: true },
    // البريد اختياري: موظفو رواء يدخلون به، وأعضاء المجتمع يدخلون برقم الهاتف
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    // اسم مستخدم اختياري — يمكن الدخول به بدل البريد (البند 49)
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    // رقم الهاتف هوية عضو المجتمع — فريد ولا يُكشف في أي مسار عام
    phone: { type: String, trim: true, unique: true, sparse: true },
    avatarUrl: String,
    status: { type: String, enum: ['active', 'suspended', 'deleted'], default: 'active', index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), required: true },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', index: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    // زيادته تُبطل كل الـ refresh tokens الصادرة لهذا المستخدم
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

userSchema.methods.comparePassword = function (plain: string) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.tokenVersion;
    delete ret.__v;
    return ret;
  },
});

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);

export const User = model<IUser>('User', userSchema);
