import { IPlatformOrder } from '../models/PlatformOrder';
import { getSetting } from '../models/Setting';

interface InvoiceOptions { lang?: 'ar' | 'en'; width?: number }

/**
 * نص الفاتورة الموحّد — يُستخدم في رسالة WhatsApp وفي الطباعة معًا
 * حتى لا تختلف الفاتورة المرسلة عن المطبوعة (البند 81).
 */
export async function buildInvoiceText(order: IPlatformOrder, opts: InvoiceOptions = {}): Promise<string> {
  const lang = opts.lang ?? 'ar';
  const w = opts.width ?? 32;
  const showPayment = await getSetting<boolean>('showPaymentOnInvoice', true);
  const line = '-'.repeat(w);
  const dbl = '='.repeat(w);
  const money = (n: number) => n.toFixed(2);
  const L = (ar: string, en: string) => (lang === 'en' ? en : ar);

  const rows = order.items.map((i) =>
    `${lang === 'en' ? i.nameEn || i.nameAr : i.nameAr}  x1  ${money(i.price)}`);

  const out = [
    dbl,
    '        RAWAA',
    '        رواء',
    dbl,
    `${L('الطلب', 'Order')}: #${order.orderNumber}`,
    `${L('العميل', 'Customer')}: ${order.customer.name}`,
    `${L('الهاتف', 'Phone')}: ${order.customer.phone}`,
    `${L('النشاط', 'Business')}: ${order.customer.businessName}`,
    line,
    ...rows,
    line,
    `${L('المجموع', 'Subtotal')}: ${money(order.subtotal)}`,
    `${L('الخصم', 'Discount')}: ${money(order.discountAmount)}${order.discountCode ? ` (${order.discountCode})` : ''}`,
    `${L('الإجمالي', 'TOTAL')}: ${money(order.total)} ${L('د.أ', 'JD')}`,
    ...(order.monthlyFee ? [`${L('رسوم شهرية', 'Monthly')}: ${money(order.monthlyFee)}`] : []),
  ];

  if (showPayment) {
    out.push(line, `${L('حالة الدفع', 'Payment')}:`);
    out.push(order.paymentStatus === 'paid'
      ? L('مدفوع ✓', 'PAID ✓')
      : L('غير مدفوع', 'UNPAID'));
  }

  out.push(line, L('شكرًا لكم', 'Thank You'), 'رواء | RAWAA', dbl);
  return out.join('\n');
}

/** رابط WhatsApp جاهز — الرقم بصيغة دولية دون + أو مسافات */
export function buildWhatsappLink(phone: string, text: string): string {
  const clean = phone.replace(/[^0-9]/g, '');
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}
