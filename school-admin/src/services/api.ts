import { setApiBase, api, storeSession, clearSession, getUser, getAccess, getRefresh } from '@shared/index';
export * from '@shared/index';
export { api, storeSession, clearSession, getUser, getAccess, getRefresh };
setApiBase((import.meta.env.VITE_API_URL as string) || 'http://localhost:5000/api');