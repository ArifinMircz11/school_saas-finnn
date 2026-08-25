import { Page, getUser } from '../services/api';

export default function Profile() {
  const user = getUser();
  return (
    <Page title="My Profile" subtitle="Your parent account">
      <div className="saa-card" style={{ maxWidth: 480, display: 'grid', gap: 10 }}>
        <p><b>Name:</b> {user?.firstName} {user?.lastName}</p>
        <p><b>Email:</b> {user?.email}</p>
        <p><b>Roles:</b> {(user?.roles || []).join(', ')}</p>
      </div>
    </Page>
  );
}