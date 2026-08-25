import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Page, Table, Badge, Stat, Field, api, formats } from '../services/api';

export default function Students() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['principal-students', q], queryFn: () => api<any>('/principal/students?q=' + encodeURIComponent(q)) });
  const students = data?.data || [];
  const atRisk = useQuery({ queryKey: ['principal-atrisk'], queryFn: () => api<any>('/principal/at-risk') });
  const risk = atRisk.data?.data || [];

  const rows = students.map((s: any) => [
    <Link to={`/students/${s.id}`}>{s.admissionNo}</Link>,
    `${s.firstName} ${s.lastName}`,
    s.className ? `${s.className}${s.sectionName ? '-' + s.sectionName : ''}` : '—',
    `${s.attendancePct}%`,
    `${s.academicPct}%`,
    formats.money(s.pendingFees),
    s.feeStatus === 'CLEAR' ? <Badge tone="green">CLEAR</Badge> : <Badge tone="amber">PENDING</Badge>,
  ]);

  return (
    <Page title="Students" subtitle="School-wide student monitoring" actions={
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Search" name="q" placeholder="Search name / ID" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
    }>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 12, marginBottom: 20 }}>
        <Stat label="Total Students" value={students.length} />
        <Stat label="At-Risk (low att./marks)" value={risk.length} />
        <Stat label="Attendance < 75%" value={students.filter((s: any) => s.attendancePct > 0 && s.attendancePct < 75).length} />
      </div>

      <h3>At-Risk Students</h3>
      {isLoading ? <p>Loading…</p> : risk.length === 0 ? <p style={{ color: '#6b7280' }}>No students currently require intervention.</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12, marginBottom: 24 }}>
          {risk.map((s: any) => (
            <div className="saa-card" key={s.id}>
              <Link to={`/students/${s.id}`}><b>{s.name}</b></Link>
              <div style={{ fontSize: 13 }}>{s.className}</div>
              <div style={{ fontSize: 13, color: '#dc2626' }}>Attendance: {s.attendancePct}% · Average: {s.academicPct}%</div>
            </div>
          ))}
        </div>
      )}

      <h3>All Students</h3>
      {isLoading ? <p>Loading…</p> : students.length === 0 ? <p style={{ color: '#6b7280' }}>No students found.</p> : (
        <Table headers={['Student ID', 'Name', 'Class', 'Attendance %', 'Academic %', 'Pending Fees', 'Fee Status']} rows={rows} />
      )}
    </Page>
  );
}