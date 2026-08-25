import { Routes, Route } from 'react-router-dom';
import AuthGuard from './auth/AuthGuard';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Parents from './pages/Parents';
import Teachers from './pages/Teachers';
import Staff from './pages/Staff';
import Academic from './pages/Academic';
import Subjects from './pages/Subjects';
import Admissions from './pages/Admissions';
import Attendance from './pages/Attendance';
import Fees from './pages/Fees';
import Exams from './pages/Exams';
import Homework from './pages/Homework';
import Timetable from './pages/Timetable';
import Documents from './pages/Documents';
import Certificates from './pages/Certificates';
import Notices from './pages/Notices';
import Reports from './pages/Reports';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AuthGuard role="SCHOOL_ADMIN"><AppLayout /></AuthGuard>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/admissions" element={<Admissions />} />
        <Route path="/students" element={<Students />} />
        <Route path="/parents" element={<Parents />} />
        <Route path="/teachers" element={<Teachers />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="/academic" element={<Academic />} />
        <Route path="/subjects" element={<Subjects />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/fees" element={<Fees />} />
        <Route path="/exams" element={<Exams />} />
        <Route path="/homework" element={<Homework />} />
        <Route path="/timetable" element={<Timetable />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/certificates" element={<Certificates />} />
        <Route path="/notices" element={<Notices />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}