import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Btn, Field, Empty, api, toast } from '../services/api';

const ALL_ROLES = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER', 'PARENT', 'STUDENT', 'STAFF'];

export default function Users() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<any>({ email: '', firstName: '', lastName: '', password: '', roles: ['STAFF'] });
  const [permUser, setPermUser] = useState<any>(null);
  const [permKeys, setPermKeys] = useState<string[]>([]);

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

  // /users/:id/roles â€” replace the user's role set (throwaway only if unused).
  const setRoles = useMutation({
    mutationFn: (v: { id: string; roles: string[] }) => api(`/users/${v.id}/roles`, { method: 'POST', body: { roles: v.roles } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast('Roles updated'); },
  });

  // GET /permissions + POST /users/:id/permissions â€” fine-grained RBAC editor.
  const { data: permData } = useQuery({ queryKey: ['permissions'], queryFn: () => api<any[]>('/permissions'), enabled: !!permUser });
  const allPerms = ((permData?.success && permData.data) || []) as any[];
  const setPermissions = useMutation({
    mutationFn: (v: { id: string; keys: string[] }) => api(`/users/${v.id}/permissions`, { method: 'POST', body: { permissionKeys: v.keys } }),
    onSuccess: () => { setPermUser(null); qc.invalidateQueries({ queryKey: ['users'] }); toast('Permissions updated'); },
  });

  // POST /auth/impersonate â€” super-admin "login as" (audited on the backend).
  const impersonate = useMutation({
    mutationFn: (id: string) => api<any>('/auth/impersonate', { method: 'POST', body: { userId: id } }),
    onSuccess: async (res) => {
      const d = res.data;
      if (d?.accessToken) {
        localStorage.setItem('saa_access', d.accessToken);
        const me = await api<any>('/auth/me');
        if (me.success && me.data && me.data.roles?.includes('SUPER_ADMIN')) {
          localStorage.setItem('saa_user', JSON.stringify(me.data));
          window.location.href = '/';
          return;
        }
        toast('Token issued â€” open the target dashboard app to continue');
      }
    },
  });

  const toggleRole = (u: any, role: string) => {
    const current = u.roles.map((x: any) => x.role);
    const next = current.includes(role) ? current.filter((r: string) => r !== role) : [...current, role];
    setRoles.mutate({ id: u.id, roles: next });
  };
  return (
    <Page title="Platform Users" subtitle="Manage users, roles, permissions & impersonation">
      <form onSubmit={(e) => { e.preventDefault(); create.mutate(draft); }} className="saa-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20, maxWidth: 720 }}>
        <Field label="First Name" name="f" value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} required />
        <Field label="Last Name" name="l" value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} />
        <Field label="Email" name="e" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} required />
        <Field label="Password" name="p" type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} required />
        <div>
          <label className="saa-label">Roles</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ALL_ROLES.map((r) => (
              <label key={'n' + r} style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={(draft.roles || []).includes(r)} onChange={(e) => setDraft({ ...draft, roles: e.target.checked ? [...(draft.roles || []), r] : (draft.roles || []).filter((x: string) => x !== r) })} /> {r}
              </label>
            ))}
          </div>
        </div>
        <div><Btn type="submit">{create.isLoading ? 'Savingâ€¦' : 'Create User'}</Btn></div>
      </form>

      {users.length === 0 ? <Empty title="No users" /> : (
        <div className="saa-card">
          {users.map((u: any) => (
            <div key={u.id} style={{ borderBottom: '1px solid #e5e7eb', padding: '12px 0', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <div style={{ minWidth: 200 }}>
                <b>{u.firstName} {u.lastName}</b>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{u.email} Â· {u.isActive ? 'Active' : 'Disabled'}</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ALL_ROLES.map((r) => (
                  <Btn key={'r' + u.id + r} variant={hasRole(u, r) ? 'secondary' : 'ghost'} onClick={() => toggleRole(u, r)} disabled={setRoles.isLoading}>{r}</Btn>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                {hasRole(u, 'SUPER_ADMIN') ? null : <Btn variant="danger" onClick={() => impersonate.mutate(u.id)} disabled={impersonate.isLoading}>Login As</Btn>}
                <Btn variant={u.isActive ? 'danger' : 'secondary'} onClick={() => activate.mutate({ id: u.id, isActive: !u.isActive })}>{u.isActive ? 'Disable' : 'Enable'}</Btn>
                <Btn variant="ghost" onClick={() => { setPermUser(permUser?.id === u.id ? null : u); setPermKeys((u.permissions || []).map((p: any) => p.permission?.key || p.key).filter(Boolean)); }}>{permUser?.id === u.id ? 'Close' : 'Permissions'}</Btn>
              </div>
              {permUser?.id === u.id ? (
                <div style={{ width: '100%' }}>
                  <div className="saa-card" style={{ marginTop: 10, padding: 14 }}>
                    <b style={{ fontSize: 14 }}>Permissions for {u.firstName} {u.lastName}</b>
                    {allPerms.length === 0 ? <p style={{ fontSize: 13, color: '#6b7280' }}>Loadingâ€¦</p> : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6, margin: '10px 0' }}>
                        {allPerms.map((p: any) => (
                          <label key={'p' + p.id} style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <input type="checkbox" checked={permKeys.includes(p.key)} onChange={(e) => setPermKeys(e.target.checked ? [...permKeys, p.key] : permKeys.filter((k) => k !== p.key))} /> {p.key}
                          </label>
                        ))}
                      </div>
                    )}
                    <Btn onClick={() => setPermissions.mutate({ id: u.id, keys: permKeys })} disabled={setPermissions.isLoading}>Save Permissions</Btn>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
