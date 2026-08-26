import React from 'react';
import { Outlet } from 'react-router-dom';
import { Layout } from '@saas/shared-ui';

const menu = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/admissions', label: 'Admissions', icon: '📋' },
  { to: '/students', label: 'Students', icon: '👨‍🎓' },
  { to: '/parents', label: 'Parents', icon: '👪' },
  { to: '/teachers', label: 'Teachers', icon: '🧑‍🏫' },
  { to: '/staff', label: 'Staff', icon: '👥' },
  { to: '/academic', label: 'Classes & Sections', icon: '🏫' },
  { to: '/subjects', label: 'Subjects', icon: '📚' },
  { to: '/attendance', label: 'Attendance', icon: '📅' },
  { to: '/fees', label: 'Fees', icon: '💰' },
  { to: '/exams', label: 'Examinations', icon: '📝' },
  { to: '/homework', label: 'Homework', icon: '📒' },
  { to: '/timetable', label: 'Timetable', icon: '🕐' },
  { to: '/documents', label: 'Documents', icon: '🗂️' },
  { to: '/certificates', label: 'Certificates', icon: '🏅' },
  { to: '/notices', label: 'Notices', icon: '📢' },
  { to: '/reports', label: 'Reports', icon: '📈' },
  { to: '/notifications', label: 'Notifications', icon: '🔔' },
  { to: '/settings', label: 'School Settings', icon: '⚙️' },
];

export default function AppLayout() {
  return (
    <Layout brand="School Admin" brandShort="🏫" menu={menu} roleKey="SCHOOL_ADMIN">
      <Outlet />
    </Layout>
  );
}