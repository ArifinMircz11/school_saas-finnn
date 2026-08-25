import React from 'react';
import { Outlet } from 'react-router-dom';
import { Layout } from '@shared/index';

const menu = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/profile', label: 'My Profile', icon: '👤' },
  { to: '/attendance', label: 'Attendance', icon: '📅' },
  { to: '/homework', label: 'Homework', icon: '📒' },
  { to: '/timetable', label: 'Timetable', icon: '🕐' },
  { to: '/exams', label: 'Exams', icon: '📝' },
  { to: '/results', label: 'Results', icon: '🏆' },
  { to: '/fees', label: 'Fees', icon: '💰' },
  { to: '/documents', label: 'Documents', icon: '🗂️' },
  { to: '/notices', label: 'Notices', icon: '📢' },
  { to: '/notifications', label: 'Notifications', icon: '🔔' },
];

export default function AppLayout() {
  return <Layout brand="Student Portal" brandShort="🎒" menu={menu} roleKey="STUDENT"><Outlet /></Layout>;
}