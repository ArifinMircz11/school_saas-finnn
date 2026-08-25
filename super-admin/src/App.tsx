import { Routes, Route } from 'react-router-dom';
import AuthGuard from './auth/AuthGuard';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { SchoolsByStatus, SchoolDetail } from './pages/Schools';
import CreateSchool from './pages/CreateSchool';
import Plans from './pages/Plans';
import Invoices from './pages/Invoices';
import Users from './pages/Users';
import Analytics from './pages/Analytics';
import Tickets from './pages/Tickets';
import Audit from './pages/Audit';
import Settings from './pages/Settings';
import Notifications from './pages/Notifications';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={
        <AuthGuard role="SUPER_ADMIN">
          <AppLayout />
        </AuthGuard>
      }>
        <Route path="/" element={<Dashboard />} />
        <Route path="/schools" element={<SchoolsByStatus />} />
        <Route path="/schools/pending" element={<SchoolsByStatus />} />
        <Route path="/schools/active" element={<SchoolsByStatus />} />
        <Route path="/schools/suspended" element={<SchoolsByStatus />} />
        <Route path="/schools/new" element={<CreateSchool />} />
        <Route path="/schools/:id" element={<SchoolDetail />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/users" element={<Users />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/notifications" element={<Notifications />} />
      </Route>
    </Routes>
  );
}