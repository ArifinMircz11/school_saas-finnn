import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Page, Table, Btn, SelectField, api, toast, formats, can } from '../services/api';

export default function Reports() {
  const [kind, setKind] = useState('csv');
  const [exporting, setExporting] = useState(false);
  const profile = useQuery({ queryKey: ['me'], queryFn: () => api<any>('/auth/me') });
  const user = profile.data?.data;
  const canExport = can(user, 'reports.export') || can(user, 'principal.reports.view');

  const report = useQuery({ queryKey: ['reports'], queryFn: () => api<any>('/reports') });
  const d = report.data?.data;
  const byClass = Object.entries(d?.students?.byClass || {}).map(([cls, list]: any) => [cls, list.length]);

  const doExport = async () => {
    setExporting(true);
    const r = await api<any>('/reports/export', { method: 'POST', body: { kind } });
    setExporting(false);
    toast(r.success ? `Export prepared: ${r.data?.url}` : (r.message || 'Export failed'));
  };

  useEffect(() => { if (!user && !profile.isLoading) toast('Note: some report actions require the reports.export permission.'); }, [user]);

  return (
    <Page title="Reports" subtitle="Executive reports (PDF / Excel / CSV)" actions={
      <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
        <SelectField label="Format" name="kind" value={kind} onChange={(e) => setKind(e.target.value)} options={[{ value: 'csv', label: 'CSV' }, { value: 'pdf', label: 'PDF' }, { value: 'xlsx', label: 'Excel' }]} />
        <Btn onClick={doExport} disabled={exporting || !canExport}>{exporting ? 'Preparing…' : 'Export report'}</Btn>
      </div>
    }>
      {canExport ? null : <p style={{ color: '#d97706' }}>You don't have the reports.export permission.</p>}

      {report.isLoading ? <p>Loading…</p> : d ? (
        <>
          <div className="saa-card">
            <h3 style={{ marginTop: 0 }}>Students report</h3>
            <div style={{ fontSize: 14 }}>Total students: <b>{d.students?.total ?? 0}</b></div>
            {byClass.length ? <Table headers={['Class', 'Students']} rows={byClass} /> : <p style={{ color: '#6b7280' }}>No students grouped yet.</p>}
          </div>
          <div className="saa-card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Fees report</h3>
            <Table headers={['Daily collection', 'Payments', 'Pending fee rows']} rows={[[formats.money(d.fees?.dailyCollection), d.fees?.payments, d.fees?.pendingFees]]} />
          </div>
          <div className="saa-card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Attendance report</h3>
            <Table headers={['Total records', 'Daily %']} rows={[[d.attendance?.totalRecords ?? 0, `${d.attendance?.dailyPercent ?? 0}%`]]} />
          </div>
        </>
      ) : null}
    </Page>
  );
}