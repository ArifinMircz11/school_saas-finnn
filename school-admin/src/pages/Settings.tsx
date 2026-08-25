import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Page, Btn, Field, api, toast } from '../services/api';

export default function Settings() {
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => api<any>('/settings') });
  const s = data?.data || {};
  const [form, setForm] = useState<any>({});
  const save = useMutation({
    mutationFn: (b: any) => api('/settings', { method: 'PUT', body: { settings: b } }),
    onSuccess: () => toast('Settings saved'),
  });

  return (
    <Page title="School Settings" subtitle="Configure school profile, academic year and preferences">
      <div className="saa-card" style={{ maxWidth: 640, display: 'grid', gap: 12 }}>
        <p><b>School:</b> {s.name}[{s.id?.slice?.(0, 8)}]</p>
        <Field label="Academic Year" name="ay" value={form.academicYear ?? s.settings?.academicYear ?? ''} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} />
        <Field label="Grading System" name="gs" value={form.gradingSystem || ''} onChange={(e) => setForm({ ...form, gradingSystem: e.target.value })} placeholder="e.g. A+, A, B+ ..." />
        <Btn onClick={() => save.mutate(form)} disabled={save.isLoading}>Save Settings</Btn>
        <details><summary style={{ cursor: 'pointer', fontSize: 14 }}>Usage</summary>
          <p>Students/Teachers/Storage limits are managed by your school's subscription (visible to the platform admin).</p>
        </details>
      </div>
    </Page>
  );
}