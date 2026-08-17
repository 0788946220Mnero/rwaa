import { Types } from 'mongoose';

/** الشكل الوحيد المسموح بإرساله عن مستخدم في مسارات المجتمع */
export interface PublicUser {
  _id: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
}

interface UserLike {
  _id: Types.ObjectId | string;
  name?: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
}

/**
 * رقم الهاتف هوية الحساب ولا يُكشف لأحد.
 * كل استجابة تخص مستخدمًا في المجتمع تمر من هنا، فلا يتسرّب حقل بالخطأ.
 */
export function toPublicUser(u: UserLike | null | undefined): PublicUser {
  if (!u) {
    return { _id: '', displayName: 'مستخدم محذوف', username: 'deleted' };
  }
  return {
    _id: String(u._id),
    displayName: u.displayName || u.name || 'مستخدم',
    username: u.username ?? '',
    avatarUrl: u.avatarUrl,
  };
}

/** الحقول التي تُجلب من قاعدة البيانات — الهاتف والبريد ليسا منها */
export const PUBLIC_USER_FIELDS = '_id name displayName username avatarUrl';
