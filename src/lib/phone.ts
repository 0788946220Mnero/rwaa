/**
 * تطبيع رقم الهاتف قبل التخزين والبحث.
 * بدون هذا يصبح 0791234567 و+962791234567 حسابين مختلفين لنفس الشخص،
 * ويسقط شرط "لا يتكرر رقم الهاتف".
 */
const DEFAULT_COUNTRY = '962'; // الأردن

export function normalizePhone(raw: string): string {
  let digits = String(raw).replace(/[^0-9+]/g, '');
  digits = digits.replace(/^00/, '+');

  if (digits.startsWith('+')) return digits;

  // 0791234567 → +962791234567
  if (digits.startsWith('0')) return `+${DEFAULT_COUNTRY}${digits.slice(1)}`;
  // 962791234567 → +962791234567
  if (digits.startsWith(DEFAULT_COUNTRY)) return `+${digits}`;
  // 791234567 → +962791234567
  return `+${DEFAULT_COUNTRY}${digits}`;
}

export function isValidPhone(normalized: string): boolean {
  return /^\+[0-9]{8,15}$/.test(normalized);
}
