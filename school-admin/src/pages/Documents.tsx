import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Empty, Badge, Btn, SelectField, api, toast, formats } from '../services/api';

export default function Documents() {
  const qc = useQueryClient();
  const [type, setType] = useState('BIRTH_CERTIFICATE');
  const [studentId, setStudentId] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const { data: students } = useQuery({ queryKey: ['students'], queryFn: () => api<any[]>('/students') });
  const { data: docs } = useQuery({ queryKey: ['documents'], queryFn: () => api<any[]>('/documents') });
  const studentOptions = ((students?.success ? students.data : []) || []).map((s: any) => ({ value: s.id, label: `${s.admissionNo} — ${s.firstName} ${s.lastName}` }));
  const list = (docs?.success ? docs.data : []) || [];

  const doUpload = useMutation({
    mutationFn: () => api('/documents/upload', { method: 'POST', body: { type, title: type, studentId }, file: file || undefined }),
    onSuccess: () => { toast('Document uploaded'); setFile(null); qc.invalidateQueries({ queryKey: ['documents'] }); },
  });
  const verify = useMutation({ mutationFn: (id: string) => api(`/documents/${id}/verify`, { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }) });

  return (
    <Page title="Documents" subtitle="Upload, verify and manage student documents">
      <div className="saa-card" style={{ maxWidth: 560, display: 'grid', gap: 12, marginBottom: 20 }}>
        <SelectField label="Student" name="s" value={studentId} onChange={(e) => setStudentId(e.target.value)} options={studentOptions} placeholder="Select student" />
        <SelectField label="Document Type" name="t" value={type} onChange={(e) => setType(e.target.value)} options={['BIRTH_CERTIFICATE', 'IDENTITY', 'TRANSFER_CERTIFICATE', 'MARKSHEET', 'MEDICAL', 'ADDRESS_PROOF', 'PHOTO', 'OTHER'].map((d) => ({ value: d, label: d.replace('_', ' ') }))} />
        <input className="saa-input" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <Btn onClick={() => studentId && file && doUpload.mutate()} disabled={doUpload.isLoading}>Upload Document</Btn>
      </div>
      {list.length === 0 ? <Empty title="No documents" /> : (
        <div className="saa-card"><Table headers={['Title', 'Type', 'Student', 'Verified', 'Uploaded', 'Actions']} rows={list.map((d: any) => [d.title, d.type, `${d.student?.firstName} ${d.student?.lastName}`, d.verified ? 'Yes' : 'No', formats.date(d.createdAt), !d.verified ? <Btn key={'v' + d.id} variant="secondary" onClick={() => verify.mutate(d.id)}>Verify</Btn> : '—'])} /></div>
      )}
    </Page>
  );
}