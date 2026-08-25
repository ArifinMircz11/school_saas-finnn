import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Page, Btn, Field, api, toast, getUser } from '../services/api';

export default function Profile() {
  const user = getUser();
  const [pwd, setPwd] = useState('');
  const save = useMutation({ mutationFn: (pw: string) => api(`/users/${user!.id}`, { method: 'PATCH', body: { password: pw } }), onSuccess: () => { toast('Profile updated'); setPwd(''); } });
  return (
    <Page title="My Profile" subtitle="Your account">
      <div className="saa-card" style={{ maxWidth: 520, display: 'grid', gap: 12 }}>
        <p><b>Name:</b> {user?.firstName} {user?.lastName}</p>
        <p><b>Email:</b> {user?.email}</p>
        <p><b>Email Verified:</b> {(user as any)?.emailVerified ? 'Yes' : 'No'}</p>
        <Field label="New Password" name="pw" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        <Btn onClick={() => pwd && save.mutate(pwd)} disabled={save.isLoading}>Update Password</Btn>
      </div>
    </Page>
  );
}