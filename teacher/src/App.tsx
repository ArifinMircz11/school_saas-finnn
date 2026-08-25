import { Routes, Route } from 'react-router-dom';
import AuthGuard from './auth/AuthGuard';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MyClasses from './pages/MyClasses';
import MyStudents from './pages/MyStudents';
import Attendance from './pages/Attendance';
import Homework from './pages/Homework';
import Marks from './pages/Marks';
import MyTimetable from './pages/MyTimetable';
import Notices from './pages/Notices';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AuthGuard role="TEACHER"><AppLayout /></AuthGuard>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/classes" element={<MyClasses />} />
        <Route path="/students" element={<MyStudents />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/homework" element={<Homework />} />
        <Route path="/marks" element={<Marks />} />
        <Route path="/timetable" element={<MyTimetable />} />
        <Route path="/notices" element={<Notices />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
    </Routes>
  );
}