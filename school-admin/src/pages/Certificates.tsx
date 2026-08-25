import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Empty, Btn, SelectField, api, toast, formats } from '../services/api';

export default function Certificates() {
  const qc = useQueryClient();
  const [studentId, setStudentId] = useState('');
  const [type, setType] = useState('BONAFIDE');
  const { data: students } = useQuery({ queryKey: ['students'], queryFn: () => api<any[]>('/students') });
  const { data: certs } = useQuery({ queryKey: ['certificates'], queryFn: () => api<any[]>('/certificates') });
  const studentOptions = ((students?.success ? students.data : []) || []).map((s: any) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }));
  const list = (certs?.success ? certs.data : []) || [];
  const gen = useMutation({ mutationFn: () => api('/certificates/generate', { method: 'POST', body: { studentId, type } }), onSuccess: () => { toast('Certificate generated'); qc.invalidateQueries({ queryKey: ['certificates'] }); } });

  return (
    <Page title="Certificates" subtitle="Generate and track certificates and transfer certificates">
      <div className="saa-card" style={{ maxWidth: 560, display: 'grid', gap: 12, marginBottom: 20 }}>
        <SelectField label="Student" name="s" value={studentId} onChange={(e) => setStudentId(e.target.value)} options={studentOptions} placeholder="Select" />
        <SelectField label="Certificate Type" name="t" value={type} onChange={(e) => setType(e.target.value)} options={['BONAFIDE', 'CHARACTER', 'STUDY', 'FEE', 'TC'].map((d) => ({ value: d, label: d }))} />
        <Btn onClick={() => studentId && gen.mutate()} disabled={gen.isLoading}>Generate Certificate</Btn>
      </div>
      {list.length === 0 ? <Empty title="No certificates" /> : (
        <div className="saa-card"><Table headers={['Number', 'Type', 'Student', 'Issued', 'Download']} rows={list.map((c: any) => [c.number, c.type, `${c.student?.firstName} ${c.student?.lastName}`, formats.date(c.issuedAt), <a key={'d' + c.id} href={c.pdfUrl || '#'} style={{ fontSize: 14 }}>⬇ Download</a>])} /></div>
      )}
    </Page>
  );
}