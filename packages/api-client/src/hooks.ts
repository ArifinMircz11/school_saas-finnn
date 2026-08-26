import { useEffect, useState } from 'react';
import { api, getUser } from './api';

/** Poll the unread notification count for the notification bell. */
export function useUnreadCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!getUser()) return;
    let stopped = false;
    const load = async () => {
      const res = await api<{ count: number }>('/notifications/unread');
      if (!stopped && res.success) setCount(res.data.count ?? 0);
    };
    load();
    const t = setInterval(load, 30000);
    return () => { stopped = true; clearInterval(t); };
  }, []);
  return count;
}

export function useMe(refreshKey = '') {
  const [user, setUser] = useState(getUser());
  useEffect(() => {
    api('/auth/me').then((res) => {
      if (res.success) setUser(res.data as never);
    });
  }, [refreshKey]);
  return user;
}
