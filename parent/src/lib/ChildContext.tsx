import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, getUser } from '../services/api';

export interface ChildInfo {
  student: {
    id: string; firstName: string; lastName: string; admissionNo: string;
    class?: { name: string } | null; section?: { name: string } | null;
    attendance?: { status: string }[]; fees?: { structure?: { name: string }; totalAmount: string; paidAmount: string; discount?: string }[];
  };
  parents?: any[];          // guardians (data-only records, shown on dashboard)
  reportAnalysis?: any;     // derived performance analysis from exam results
}

const Ctx = createContext<{ children: ChildInfo[]; child: ChildInfo | null; setChild: (c: ChildInfo) => void }>({ children: [], child: null, setChild: () => {} });

export function ChildProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<{ children: ChildInfo[]; unread: number }>({ children: [], unread: 0 });
  const [child, setChild] = useState<ChildInfo | null>(null);

  useEffect(() => {
    if (!getUser()) return;
    api<any>('/dashboard').then((res) => {
      const payload = res?.data?.data;
      if (res.success && payload?.children) {
        setData({ children: payload.children, unread: payload.unread ?? 0 });
        setChild((c) => c || payload.children[0] || null);
      }
    });
  }, []);

  return <Ctx.Provider value={{ children: data.children, child, setChild }}>{children}</Ctx.Provider>;
}

export const useChildren = () => useContext(Ctx);