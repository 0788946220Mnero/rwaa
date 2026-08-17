/** أنواع وثوابت مشتركة بين الباك إند والفرونت إند */

export const ROLES = {
  PLATFORM_ADMIN: 'platform_admin',
  PLATFORM_STAFF: 'platform_staff',
  BUSINESS_OWNER: 'business_owner',
  BUSINESS_STAFF: 'business_staff',
  COMMUNITY_MEMBER: 'community_member',
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

export const PLATFORM_ROLES: Role[] = [ROLES.PLATFORM_ADMIN, ROLES.PLATFORM_STAFF];
export const BUSINESS_ROLES: Role[] = [ROLES.BUSINESS_OWNER, ROLES.BUSINESS_STAFF];

export type UserStatus = 'active' | 'suspended' | 'deleted';
export type ContentStatus = 'active' | 'hidden' | 'deleted';
export type ReportReason = 'violation' | 'abuse' | 'spam' | 'inappropriate' | 'other';

export type BusinessType = 'restaurant' | 'fashion';
export type BusinessStatus = 'open' | 'busy' | 'closed' | 'paused';

export type PlatformOrderStatus =
  | 'new' | 'contacted' | 'in_progress' | 'completed' | 'cancelled';

export type OrderStatus =
  | 'new' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

export type Lang = 'ar' | 'en';

/** نص ثنائي اللغة — يُخزَّن هكذا في قاعدة البيانات */
export interface I18nText { ar: string; en: string }

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** أكواد الخدمات — الأسعار تأتي من قاعدة البيانات دائمًا، لا من هنا */
export const SERVICE_CODES = {
  RESTAURANT_PLATFORM: 'r_platform',
  RESTAURANT_MENU: 'r_menu',
  RESTAURANT_HOME: 'r_home',
  RESTAURANT_DASHBOARD: 'r_dashboard',
  RESTAURANT_ORDERING: 'r_ordering',
  RESTAURANT_BANNER: 'r_banner',
  RESTAURANT_VERIFY: 'r_verify',
  RESTAURANT_QR: 'r_qr',
  FASHION_HOME: 'f_home',
  FASHION_PRODUCTS: 'f_products',
  FASHION_DASHBOARD: 'f_dashboard',
  FASHION_BANNER: 'f_banner',
  FASHION_VERIFY: 'f_verify',
} as const;

export const SETTING_KEYS = {
  LOGO: 'logo',
  HERO_BACKGROUND: 'heroBackground',
  HERO_TITLE: 'heroTitle',
  HERO_SUBTITLE: 'heroSubtitle',
  ABOUT_CONTENT: 'aboutContent',
  CONTACT_PHONE: 'contactPhone',
  CONTACT_WHATSAPP: 'contactWhatsapp',
  CONTACT_EMAIL: 'contactEmail',
  SOCIAL: 'social',
  DEFAULT_WHATSAPP_MESSAGE: 'defaultWhatsappMessage',
  MONTHLY_FEE_RESTAURANT: 'monthlyFeeRestaurant',
  MONTHLY_FEE_FASHION: 'monthlyFeeFashion',
  CURRENCY: 'currency',
} as const;
