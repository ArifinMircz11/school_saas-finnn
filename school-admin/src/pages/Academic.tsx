import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Btn, Field, api, toast } from '../services/api';

export default function Academic() {
  const qc = useQueryClient();
  const [cls, setCls] = useState('');
  const [sec, setSec] = useState<{ classId: string; name: string }>({ classId: '', name: '' });
  const { data } = useQuery({ queryKey: ['classes'], queryFn: () => api<any[]>('/academic/classes') });
  const classes = (data?.success ? data.data : []) || [];

  const addClass = useMutation({ mutationFn: (n: string) => api('/academic/classes', { method: 'POST', body: { name: n } }), onSuccess: () => { toast('Class added'); setCls(''); qc.invalidateQueries({ queryKey: ['classes'] }); } });
  const addSection = useMutation({ mutationFn: (b: any) => api('/academic/sections', { method: 'POST', body: b }), onSuccess: () => { toast('Section added'); setSec({ classId: '', name: '' }); qc.invalidateQueries({ queryKey: ['classes'] }); } });

  return (
    <Page title="Classes & Sections" subtitle="Organize academic structure">
      <div className="saa-card" style={{ marginBottom: 20, maxWidth: 560, display: 'grid', gap: 12 }}>
        <Field label="New Class Name" name="c" value={cls} onChange={(e) => setCls(e.target.value)} />
        <Btn onClick={() => cls && addClass.mutate(cls)}>Add Class</Btn>
      </div>
      <div className="saa-card" style={{ marginBottom: 20, maxWidth: 560, display: 'grid', gap: 12 }}>
        <h3>Add Section</h3>
        <select className="saa-select" value={sec.classId} onChange={(e) => setSec({ ...sec, classId: e.target.value })}>
          <option value="">Select class</option>
          {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Field label="Section Name" name="s" value={sec.name} onChange={(e) => setSec({ ...sec, name: e.target.value })} />
        <Btn onClick={() => sec.classId && sec.name && addSection.mutate(sec)}>Add Section</Btn>
      </div>
      <div>
        {classes.map((c: any) => (
          <div key={c.id} className="saa-card" style={{ marginBottom: 10, padding: 14 }}>
            <b>{c.name}</b> — Sections: {c.sections?.map((s: any) => s.name).join(', ') || 'none'}
          </div>
        ))}
      </div>
    </Page>
  );
}