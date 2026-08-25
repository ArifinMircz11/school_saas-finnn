import { Page, getUser } from '../services/api';

export default function Profile() {
  const user = getUser();
  return (
    <Page title="My Profile" subtitle="Your student account">
      <div className="saa-card" style={{ maxWidth: 480, display: 'grid', gap: 10 }}>
        <p><b>Name:</b> {user?.firstName} {user?.lastName}</p>
        <p><b>Email:</b> {user?.email}</p>
        <p><b>School ID:</b> {user?.schoolId ? user.schoolId.slice(0, 8) : '—'}</p>
        <p><b>Email Verified:</b> {(user as any)?.emailVerified ? 'Yes' : 'No'}</p>
      </div>
    </Page>
  );
}