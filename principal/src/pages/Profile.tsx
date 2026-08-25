import { useQuery } from '@tanstack/react-query';
import { Page, Badge, Empty, api } from '../services/api';

export default function Profile() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<any>('/auth/me') });
  const prof = useQuery({ queryKey: ['principal-profile'], queryFn: () => api<any>('/principal/profile') });
  const user = me.data?.data;
  const p = prof.data?.data;

  return (
    <Page title="My Profile" subtitle="Your account and configured permissions">
      {me.isLoading ? <p>Loading…</p> : user ? (
        <>
          <div className="saa-card">
            <h3 style={{ marginTop: 0 }}>{user.firstName} {user.lastName}</h3>
            <div style={{ fontSize: 14, color: '#6b7280' }}>{user.email} · School: {user.school?.name || '—'}</div>
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {user.roles.map((r: string) => <Badge key={r} tone="slate">{r}</Badge>)}
            </div>
          </div>
          <div className="saa-card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Your Permissions</h3>
            {user.permissions.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {user.permissions.map((perm: string) => <Badge key={perm} tone="green">{perm}</Badge>)}
              </div>
            ) : <p style={{ color: '#6b7280' }}>No permissions granted.</p>}
          </div>
          {p ? (
            <div className="saa-card" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>Principal Settings</h3>
              <div style={{ fontSize: 14 }}>Title: <b>{p.title || 'Principal'}</b></div>
              <div style={{ fontSize: 14 }}>Admission approval workflow: <b>{p.approvalWorkflow ? 'Enabled' : 'Disabled'}</b></div>
            </div>
          ) : null}
        </>
      ) : <Empty title="Not loaded" />}
    </Page>
  );
}