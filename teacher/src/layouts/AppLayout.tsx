import React from 'react';
import { Outlet } from 'react-router-dom';
import { Layout } from '@saas/shared-ui';

const menu = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/classes', label: 'My Classes', icon: '🏫' },
  { to: '/students', label: 'My Students', icon: '👨‍🎓' },
  { to: '/attendance', label: 'Attendance', icon: '📅' },
  { to: '/homework', label: 'Homework', icon: '📒' },
  { to: '/marks', label: 'Exams & Marks', icon: '📝' },
  { to: '/timetable', label: 'Timetable', icon: '🕐' },
  { to: '/notices', label: 'Notices', icon: '📢' },
  { to: '/notifications', label: 'Notifications', icon: '🔔' },
  { to: '/profile', label: 'My Profile', icon: '👤' },
];

export default function AppLayout() {
  return <Layout brand="Teacher" brandShort="👩‍🏫" menu={menu} roleKey="TEACHER"><Outlet /></Layout>;
}