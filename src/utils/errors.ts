export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (m = 'طلب غير صالح', d?: unknown) => new AppError(400, m, 'BAD_REQUEST', d);
export const unauthorized = (m = 'غير مصرّح') => new AppError(401, m, 'UNAUTHORIZED');
export const forbidden = (m = 'ليست لديك صلاحية') => new AppError(403, m, 'FORBIDDEN');
export const notFound = (m = 'العنصر غير موجود') => new AppError(404, m, 'NOT_FOUND');
export const conflict = (m = 'تعارض في البيانات') => new AppError(409, m, 'CONFLICT');
