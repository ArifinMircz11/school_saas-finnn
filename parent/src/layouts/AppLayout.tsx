import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Layout } from '@shared/index';

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
  return <Layout brand="Parent Portal" brandShort="👪" menu={menu} roleKey="PARENT"><Outlet /></Layout>;
}