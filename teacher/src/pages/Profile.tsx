import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Page, Btn, Field, api, toast, getUser } from '../services/api';

export default function Profile() {
  const user = getUser();
  const [pwd, setPwd] = useState('');
  const [current, setCurrent] = useState('');
  const save = useMutation({
    mutationFn: (pw: string) => api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: pw } }),
    onSuccess: () => { toast('Password updated'); setPwd(''); setCurrent(''); },
  });
  return (
    <Page title="My Profile" subtitle="Your account">
      <div className="saa-card" style={{ maxWidth: 520, display: 'grid', gap: 12 }}>
        <p><b>Name:</b> {user?.firstName} {user?.lastName}</p>
        <p><b>Email:</b> {user?.email}</p>
        <p><b>Email Verified:</b> {(user as any)?.emailVerified ? 'Yes' : 'No'}</p>
        <Field label="Current Password" name="current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Field label="New Password" name="pw" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        <Btn onClick={() => pwd && current && save.mutate(pwd)} disabled={save.isLoading || !current || !pwd}>Update Password</Btn>
      </div>
    </Page>
  );
}