import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Page, Btn, Field, api, toast } from '../services/api';
import { useNavigate } from 'react-router-dom';

export default function CreateSchool() {
  const nav = useNavigate();
  const [form, setForm] = useState<any>({ name: '', code: '', email: '', phone: '', address: '', city: '', state: '', country: 'IN', admin: { firstName: '', lastName: '', email: '', password: '' } });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: () => api('/schools/full', { method: 'POST', body: { ...form } }),
    onSuccess: (res) => { toast('School + admin created'); if (res.success) nav('/schools'); },
    onError: () => toast('Failed to create school'),
  });

  return (
    <Page title="Create School" subtitle="Provision a new tenant with an admin account">
      <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="saa-card" style={{ maxWidth: 640, display: 'grid', gap: 14 }}>
        <Field label="School Name" name="name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
        <Field label="School Code (lowercase)" name="code" value={form.code} onChange={(e) => set('code', e.target.value)} required placeholder="e.g. sunrise-academy" />
        <Field label="Email" name="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        <Field label="Phone" name="phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        <Field label="Address" name="address" value={form.address} onChange={(e) => set('address', e.target.value)} />
        <Field label="City" name="city" value={form.city} onChange={(e) => set('city', e.target.value)} />
        <hr />
        <h3 style={{ margin: 0 }}>Admin Account</h3>
        <Field label="Admin First Name" name="afn" value={form.admin.firstName} onChange={(e) => set('admin', { ...form.admin, firstName: e.target.value })} />
        <Field label="Admin Last Name" name="aln" value={form.admin.lastName} onChange={(e) => set('admin', { ...form.admin, lastName: e.target.value })} />
        <Field label="Admin Email" name="aem" type="email" value={form.admin.email} onChange={(e) => set('admin', { ...form.admin, email: e.target.value })} required />
        <Field label="Admin Password" name="apw" type="password" value={form.admin.password} onChange={(e) => set('admin', { ...form.admin, password: e.target.value })} required />
        <Btn type="submit" disabled={create.isLoading}>{create.isLoading ? 'Creating…' : 'Create School'}</Btn>
      </form>
    </Page>
  );
}