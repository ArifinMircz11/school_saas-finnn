import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, getUser } from '../services/api';

export interface ChildInfo {
  student: {
    id: string; firstName: string; lastName: string; admissionNo: string;
    class?: { name: string } | null; section?: { name: string } | null;
    attendance?: { status: string }[]; fees?: { structure?: { name: string }; totalAmount: string; paidAmount: string; discount?: string }[];
  };
}

const Ctx = createContext<{ children: ChildInfo[]; child: ChildInfo | null; setChild: (c: ChildInfo) => void }>({ children: [], child: null, setChild: () => {} });

export function ChildProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<{ children: ChildInfo[]; unread: number }>({ children: [], unread: 0 });
  const [child, setChild] = useState<ChildInfo | null>(null);

  useEffect(() => {
    if (!getUser()) return;
    api<{ data: { children: ChildInfo[]; unread: number } }>('/dashboard').then((res) => {
      if (res.success && res.data?.children) {
        setData({ children: res.data.children, unread: res.data.unread ?? 0 });
        setChild((c) => c || res.data.children[0] || null);
      }
    });
  }, []);

  return <Ctx.Provider value={{ children: data.children, child, setChild }}>{children}</Ctx.Provider>;
}

export const useChildren = () => useContext(Ctx);