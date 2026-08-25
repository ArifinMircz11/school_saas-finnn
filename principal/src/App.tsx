import { Routes, Route } from 'react-router-dom';
import AuthGuard from './auth/AuthGuard';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import StudentDetail from './pages/StudentDetail';
import Teachers from './pages/Teachers';
import Classes from './pages/Classes';
import Attendance from './pages/Attendance';
import AcademicPerformance from './pages/AcademicPerformance';
import Exams from './pages/Exams';
import Results from './pages/Results';
import Homework from './pages/Homework';
import Timetable from './pages/Timetable';
import Admissions from './pages/Admissions';
import Fees from './pages/Fees';
import Approvals from './pages/Approvals';
import Notices from './pages/Notices';
import Reports from './pages/Reports';
import Analytics from './pages/Analytics';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AuthGuard role="PRINCIPAL"><AppLayout /></AuthGuard>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/students" element={<Students />} />
        <Route path="/students/:id" element={<StudentDetail />} />
        <Route path="/teachers" element={<Teachers />} />
        <Route path="/classes" element={<Classes />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/academic" element={<AcademicPerformance />} />
        <Route path="/exams" element={<Exams />} />
        <Route path="/results" element={<Results />} />
        <Route path="/homework" element={<Homework />} />
        <Route path="/timetable" element={<Timetable />} />
        <Route path="/admissions" element={<Admissions />} />
        <Route path="/fees" element={<Fees />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/notices" element={<Notices />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
    </Routes>
  );
}