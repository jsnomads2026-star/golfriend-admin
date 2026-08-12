import { createContext, useContext } from 'react';
import type { AdminLocale } from './adminNavigation';
export const AdminLocaleContext = createContext<AdminLocale>('en');
export const useAdminLocale = () => useContext(AdminLocaleContext);
