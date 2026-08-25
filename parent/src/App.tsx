import { Routes, Route } from 'react-router-dom';
import AuthGuard from './auth/AuthGuard';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Children from './pages/Children';
import FeesPage from './pages/Fees';
import Attendance from './pages/Attendance';
import Homework from './pages/Homework';
import Timetable from './pages/Timetable';
import Results from './pages/Results';
import Documents from './pages/Documents';
import Certificates from './pages/Certificates';
import Notices from './pages/Notices';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AuthGuard role="PARENT"><AppLayout /></AuthGuard>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/children" element={<Children />} />
        <Route path="/fees" element={<FeesPage />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/homework" element={<Homework />} />
        <Route path="/timetable" element={<Timetable />} />
        <Route path="/results" element={<Results />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/certificates" element={<Certificates />} />
        <Route path="/notices" element={<Notices />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
    </Routes>
  );
}