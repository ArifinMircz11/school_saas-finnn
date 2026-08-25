import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Empty, Btn, Field, api, toast } from '../services/api';

export default function Subjects() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const { data } = useQuery({ queryKey: ['subjects'], queryFn: () => api<any[]>('/academic/subjects') });
  const subjects = (data?.success ? data.data : []) || [];
  const add = useMutation({ mutationFn: (n: string) => api('/academic/subjects', { method: 'POST', body: { name: n } }), onSuccess: () => { toast('Subject added'); setName(''); qc.invalidateQueries({ queryKey: ['subjects'] }); } });
  return (
    <Page title="Subjects" subtitle="School subject catalog">
      <div className="saa-card" style={{ maxWidth: 480, display: 'grid', gap: 12, marginBottom: 20 }}>
        <Field label="Subject Name" name="n" value={name} onChange={(e) => setName(e.target.value)} />
        <Btn onClick={() => name && add.mutate(name)}>Add Subject</Btn>
      </div>
      {subjects.length === 0 ? <Empty title="No subjects" /> : (
        <div className="saa-card"><Table headers={['Name']} rows={subjects.map((s: any) => [s.name])} /></div>
      )}
    </Page>
  );
}