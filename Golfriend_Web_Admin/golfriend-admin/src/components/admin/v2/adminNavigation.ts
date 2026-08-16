export const ADMIN_LOCALES = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'] as const;
export type AdminLocale = (typeof ADMIN_LOCALES)[number];
export const ADMIN_AREAS = ['overview','courses','bookings','partners','marketing','advertising','exchange','reports'] as const;
export type AdminArea = (typeof ADMIN_AREAS)[number];
export const isAdminArea = (value: string | null): value is AdminArea => ADMIN_AREAS.some((area) => area === value);
