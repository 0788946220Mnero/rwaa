import { NextFunction, Request, Response, RequestHandler } from 'express';

/** يلتقط أخطاء الدوال غير المتزامنة ويمررها إلى معالج الأخطاء */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
