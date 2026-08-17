import { Router } from 'express';
import { z } from 'zod';
import { Service } from '../../models/Service';
import { crudRouter, i18nSchema } from '../../lib/crudFactory';
import { asyncHandler } from '../../utils/asyncHandler';

const createSchema = z.object({
  code: z.string().min(2),
  businessType: z.enum(['restaurant', 'fashion']),
  name: i18nSchema,
  description: i18nSchema,
  price: z.number().min(0),
  isFree: z.boolean().optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
});

const router = crudRouter({
  model: Service,
  resource: 'service',
  createSchema,
  updateSchema: createSchema.partial(),
  defaultSort: 'sortOrder',
});

/** باقة نوع نشاط محدد — تُستهلك في /restaurants/packages و /fashion/packages */
router.get('/by-type/:type', asyncHandler(async (req, res) => {
  const type = req.params.type === 'fashion' ? 'fashion' : 'restaurant';
  const items = await Service.find({ businessType: type, isActive: true }).sort('sortOrder').lean();
  res.json({ items });
}));

export default router;
