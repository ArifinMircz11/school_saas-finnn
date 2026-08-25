import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Badge, Btn, Field, Empty, api, toast } from '../services/api';

export default function Users() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<any>({ email: '', firstName: '', lastName: '', password: '', roles: ['STAFF'] });
  const [permUser, setPermUser] = useState<any>(null);

  const { data } = useQuery({ queryKey: ['users'], queryFn: () => api<any[]>('/users') });
  const users = (data?.success ? data.data : []) || [];
  const hasRole = (u: any, r: string) => (u.roles || []).some((x: any) => x.role === r);

  const create = useMutation({
    mutationFn: (body: any) => api('/users', { method: 'POST', body }),
    onSuccess: () => { toast('User created'); qc.invalidateQueries({ queryKey: ['users'] }); },
  });

  const activate = useMutation({
    mutationFn: (v: { id: string; isActive: boolean }) => api(`/users/${v.id}`, { method: 'PATCH', body: { isActive: v.isActive } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast('User updated'); },
  });

  return (
    <Page title="Platform Users" subtitle="Manage users across the platform">
      <form onSubmit={(e) => { e.preventDefault(); create.mutate(draft); }} className="saa-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20, maxWidth: 720 }}>
        <Field label="First Name" name="f" value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} required />
        <Field label="Last Name" name="l" value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} />
        <Field label="Email" name="e" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} required />
        <Field label="Password" name="p" type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} required />
        <div><Btn type="submit">{create.isLoading ? 'Saving…' : 'Create User'}</Btn></div>
      </form>

      {users.length === 0 ? <Empty title="No users" /> : (
        <div className="saa-card">
          <Table headers={['Name', 'Email', 'Roles', 'Status', 'Actions']}
            rows={users.map((u: any) => [
              `${u.firstName} ${u.lastName}`, u.email,
              (u.roles || []).map((r: any) => <Badge key={r.role} tone={hasRoleBadge(r.role)}>{r.role}</Badge>),
              u.isActive ? 'Active' : 'Disabled',
              <Btn key={'b' + u.id} variant={u.isActive ? 'danger' : 'secondary'} onClick={() => activate.mutate({ id: u.id, isActive: !u.isActive })}>{u.isActive ? 'Disable' : 'Enable'}</Btn>,
            ])} />
        </div>
      )}
    </Page>
  );
}

function hasRoleBadge(role: string) {
  return (role === 'SUPER_ADMIN' ? 'red' : role === 'SCHOOL_ADMIN' ? 'slate' : role === 'STAFF' ? 'amber' : 'green') as 'red' | 'slate' | 'amber' | 'green';
}