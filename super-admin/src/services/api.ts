import { setApiBase, api, storeSession, clearSession, getUser, getAccess, getRefresh } from '@saas/api-client';

export * from '@saas/api-client';
export * from '@saas/shared-ui';
export { api, storeSession, clearSession, getUser, getAccess, getRefresh };

// Point the shared client at the central backend. Override via VITE_API_URL.
setApiBase((import.meta.env.VITE_API_URL as string || (import.meta.env.DEV ? 'http://localhost:5000/api' : '')).replace(/\/$/, '') || '');