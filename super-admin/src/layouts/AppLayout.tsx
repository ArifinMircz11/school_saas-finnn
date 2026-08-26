import React from 'react';
import { Outlet } from 'react-router-dom';
import { Layout } from '@saas/shared-ui';

const menu = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/schools', label: 'All Schools', icon: '🏫' },
  { to: '/schools/pending', label: 'Pending Schools', icon: '⏳' },
  { to: '/schools/active', label: 'Active Schools', icon: '✅' },
  { to: '/schools/suspended', label: 'Suspended Schools', icon: '⛔' },
  { to: '/plans', label: 'Subscriptions & Plans', icon: '💳' },
  { to: '/invoices', label: 'Invoices', icon: '🧾' },
  { to: '/users', label: 'Platform Users', icon: '👥' },
  { to: '/analytics', label: 'Platform Analytics', icon: '📈' },
  { to: '/tickets', label: 'Support Tickets', icon: '🎫' },
  { to: '/audit', label: 'Audit Logs', icon: '🕵️' },
  { to: '/settings', label: 'System Settings', icon: '⚙️' },
  { to: '/notifications', label: 'Notifications', icon: '🔔' },
];

export default function AppLayout() {
  return (
    <Layout brand="School SaaS" brandShort="🎓" menu={menu} roleKey="SUPER_ADMIN">
      <Outlet />
    </Layout>
  );
}