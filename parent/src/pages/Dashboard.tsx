import { useState } from 'react';
import { Page, Stat, Empty, api, getUser } from '../services/api';
import { useChildren } from '../lib/ChildContext';

export default function Dashboard() {
  const { children, child, setChild } = useChildren();
  const user = getUser();
  const [sel, setSel] = useState<string | null>(null);

    const activeChild = children.find((c) => c.student.id === (sel || child?.student.id)) || child;
  const first = activeChild?.student;

  return (
    <Page title={`Welcome, ${user?.firstName || 'Student'}`} subtitle="Overview of your academic performance">
      {children.length === 0 ? <p>No student data available.</p> : (
        <>
          {children.length > 1 ? (
            <div className="saa-card" style={{ marginBottom: 16 }}>
              <b>Select Child:</b>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {children.map((c) => (
                  <button key={c.student.id} onClick={() => setSel(c.student.id)}
                    style={{
                      padding: '8px 14px', borderRadius: 8, border: c.student.id === activeChild?.student.id ? '2px solid #4f46e5' : '1px solid #e5e7eb',
                      background: c.student.id === activeChild?.student.id ? '#eef2ff' : '#fff', cursor: 'pointer',
                    }}>
                    <b>{c.student.firstName} {c.student.lastName}</b>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{c.student.class?.name}-{c.student.section?.name}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {first ? (
            <div className="saa-card">
              <h3>{first.firstName} {first.lastName} <span style={{ fontSize: 13, color: '#6b7280' }}>· {first.class?.name} {first.section?.name}</span></h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 14, marginTop: 10 }}>
                <Stat label="Attendance" value={attPct(first) + '%'} />
                <Stat label="Pending Fees" value={'₹' + pendingSum(first).toLocaleString('en-IN')} />
                <Stat label="Fee Records" value={first.fees?.length ?? 0} />
              </div>
            </div>
          ) : null}

          {/* Parents section: guardians are shown so student/parent can see
              contact info and performance report analysis together. */}
          {activeChild?.parents && activeChild.parents.length > 0 ? (
            <div className="saa-card" style={{ marginTop: 20 }}>
              <h3 style={{ marginTop: 0 }}>Parents / Guardians</h3>
              {activeChild.parents.map((p: any) => (
                <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid #e5e7eb' }}>
                  <b>{p.firstName} {p.lastName}</b> <span style={{ fontSize: 12, color: '#6b7280' }}>({p.relationship || 'Parent'})</span>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{p.phone || '—'} {p.email ? `· ${p.email}` : ''}</div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Performance report analysis (derived from exam results) */}
          {activeChild?.reportAnalysis ? (
            <div className="saa-card" style={{ marginTop: 20 }}>
              <h3 style={{ marginTop: 0 }}>Performance Report</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 14, marginTop: 10 }}>
                <Stat label="Overall Average" value={activeChild.reportAnalysis.overallAverage + '%'} />
                <Stat label="Exams Taken" value={activeChild.reportAnalysis.totalExams} />
                <Stat label="Trend" value={activeChild.reportAnalysis.examTrend} />
              </div>
              {activeChild.reportAnalysis.subjectAverages && activeChild.reportAnalysis.subjectAverages.length > 0 ? (
                <div style={{ marginTop: 14 }}>
                  <b>Subject Averages</b>
                  <div style={{ display: 'grid', gap: 4, marginTop: 8, fontSize: 14 }}>
                    {activeChild.reportAnalysis.subjectAverages.map((s: any) => (
                      <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{s.name}</span>
                        <span style={{ color: '#4f46e5', fontWeight: 600 }}>{s.average}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Page>
  );
}

function attPct(s: any) {
  const a = s.attendance || [];
  if (!a.length) return 0;
  return Math.round((a.filter((x: any) => x.status === 'PRESENT').length / a.length) * 100);
}
function pendingSum(s: any) {
  return (s.fees || []).reduce((sum: number, f: any) => sum + (Number(f.totalAmount) - Number(f.paidAmount)), 0);
}