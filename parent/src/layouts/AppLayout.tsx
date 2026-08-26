import React from 'react';
import { Outlet } from 'react-router-dom';
import { Layout } from '@saas/shared-ui';
import { getUser } from '@saas/api-client';

const menu = [
  { to: '/', label: 'Dashboard', icon: '🏠' },
  { to: '/children', label: 'My Children', icon: '👨‍👩‍👧' },
  { to: '/fees', label: 'Fees', icon: '💰' },
  { to: '/attendance', label: 'Attendance', icon: '📅' },
  { to: '/homework', label: 'Homework', icon: '📒' },
  { to: '/timetable', label: 'Timetable', icon: '🕐' },
  { to: '/results', label: 'Exams & Results', icon: '🏆' },
  { to: '/documents', label: 'Documents', icon: '🗂️' },
  { to: '/certificates', label: 'Certificates', icon: '🏅' },
  { to: '/notices', label: 'Notices', icon: '📢' },
  { to: '/notifications', label: 'Notifications', icon: '🔔' },
  { to: '/profile', label: 'My Profile', icon: '👤' },
];

export default function AppLayout() {
  const user = getUser();
  const isParent = !!user && user.roles.includes('PARENT');
  // One dashboard serves both students and parents; only the branding adapts.
  const brand = isParent ? 'Parent Portal' : 'Student Portal';
  const roleKey = isParent ? 'PARENT' : 'STUDENT';
  return <Layout brand={brand} brandShort="🎓" menu={menu} roleKey={roleKey}><Outlet /></Layout>;
}