import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getUser, AuthUser } from '../lib/api';
import { colors } from '../lib/tokens';

/** A shared, role-branded login form. Each dashboard configures its own role/redirect. */
export function LoginShell({
  appName, subtitle, roleValidator, redirectTo = '/',
}: {
  appName: string; subtitle: string;
  roleValidator: (roles: string[]) => boolean;
  redirectTo?: string;
}) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const res = await api<{ accessToken: string; refreshToken: string; user: AuthUser }>('/auth/login', {
      method: 'POST', body: { email, password },
    });
    setLoading(false);
    if (!res.success) { setError(res.message || 'Login failed'); return; }
    const d = res.data;
    if (!roleValidator(d.user.roles)) {
      setError('Your account does not have access to this dashboard.');
      return;
    }
    localStorage.setItem('saa_access', d.accessToken);
    localStorage.setItem('saa_refresh', d.refreshToken);
    localStorage.setItem('saa_user', JSON.stringify(d.user));
    navigate(redirectTo);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,' + colors.primary + ',#6d28d9)' }}>
      <div style={{ background: '#fff', padding: 40, borderRadius: 16, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 40 }}>🎓</div>
          <h2 style={{ margin: '8px 0 0' }}>{appName}</h2>
          <p style={{ color: colors.textMuted, fontSize: 13, margin: '4px 0 0' }}>{subtitle}</p>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="saa-label">Email</label>
            <input className="saa-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@school.com" />
          </div>
          <div>
            <label className="saa-label">Password</label>
            <input className="saa-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
          </div>
          {error ? <div style={{ color: colors.danger, fontSize: 13 }}>{error}</div> : null}
          <button type="submit" className="saa-btn" style={{ justifyContent: 'center' }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {getUser() ? <p style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 12 }}>Already signed in as {getUser()?.email}</p> : null}
      </div>
    </div>
  );
}