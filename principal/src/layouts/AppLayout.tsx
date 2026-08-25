import React from 'react';
import { Outlet } from 'react-router-dom';
import { Layout } from '@shared/index';

const menu = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/students', label: 'Students', icon: '👨‍🎓' },
  { to: '/teachers', label: 'Teachers', icon: '👩‍🏫' },
  { to: '/classes', label: 'Classes & Sections', icon: '🏫' },
  { to: '/attendance', label: 'Attendance', icon: '📅' },
  { to: '/academic', label: 'Academic Performance', icon: '📈' },
  { to: '/exams', label: 'Examinations', icon: '📝' },
  { to: '/results', label: 'Results', icon: '✅' },
  { to: '/homework', label: 'Homework', icon: '📒' },
  { to: '/timetable', label: 'Timetable', icon: '🕐' },
  { to: '/admissions', label: 'Admissions', icon: '🗂️' },
  { to: '/fees', label: 'Fees Overview', icon: '💰' },
  { to: '/approvals', label: 'Leave & Approvals', icon: '🛂' },
  { to: '/notices', label: 'Notices', icon: '📢' },
  { to: '/reports', label: 'Reports', icon: '🗞️' },
  { to: '/analytics', label: 'Analytics', icon: '📉' },
  { to: '/notifications', label: 'Notifications', icon: '🔔' },
  { to: '/profile', label: 'My Profile', icon: '👤' },
];

export default function AppLayout() {
  return <Layout brand="Principal" brandShort="🎓" menu={menu} roleKey="PRINCIPAL"><Outlet /></Layout>;
}