import { setApiBase, api, storeSession, clearSession, getUser, getAccess, getRefresh } from '@shared/index';

export * from '@shared/index';
export { api, storeSession, clearSession, getUser, getAccess, getRefresh };

// Point the shared client at the central backend. Override via VITE_API_URL.
setApiBase((import.meta.env.VITE_API_URL as string) || 'http://localhost:5000/api');