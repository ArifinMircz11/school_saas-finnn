import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, getUser, AuthUser } from '@saas/api-client';
import { colors } from './tokens';

/** A shared, role-branded login form. Each dashboard configures its own role/redirect.
 *  Also hosts the forgot/reset password flow:
 *   - "Forgot password?"  -> POST /auth/forgot-password (sends a reset link)
 *   - /login?resetToken=.. -> POST /auth/reset-password (uses the emailed token) */
export function LoginShell({
  appName, subtitle, roleValidator, redirectTo = '/',
}: {
  appName: string; subtitle: string;
  roleValidator: (roles: string[]) => boolean;
  redirectTo?: string;
}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const resetToken = params.get('resetToken') || '';
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset'>(resetToken ? 'reset' : 'login');
  const [email, setEmail] = useState(params.get('email') || '');
  const [password, setPassword] = useState('');
  const [newPass, setNewPass] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setInfo(''); setLoading(true);
    if (mode === 'forgot') {
      const res = await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setLoading(false);
      if (!res.success) { setError(res.message || 'Request failed'); return; }
      setInfo('If an account exists, a reset link has been emailed to you.');
      return;
    }
    if (mode === 'reset') {
      const res = await api('/auth/reset-password', { method: 'POST', body: { token: resetToken, password: newPass } });
      setLoading(false);
      if (!res.success) { setError(res.message || 'Reset failed'); return; }
      setInfo('Password updated. You can now sign in with your new password.');
      setMode('login');
      return;
    }
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
          {mode === 'login' ? (
            <>
              <div>
                <label className="saa-label">Email</label>
                <input className="saa-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@school.com" />
              </div>
              <div>
                <label className="saa-label">Password</label>
                <input className="saa-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
              </div>
              {error ? <div style={{ color: colors.danger, fontSize: 13 }}>{error}</div> : null}
              <button type="submit" className="saa-btn" style={{ justifyContent: 'center' }} disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
              <button type="button" className="saa-btn saa-btn-ghost" style={{ justifyContent: 'center' }} onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}>Forgot password?</button>
            </>
          ) : mode === 'forgot' ? (
            <>
              <div>
                <label className="saa-label">Email</label>
                <input className="saa-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@school.com" />
              </div>
              {error ? <div style={{ color: colors.danger, fontSize: 13 }}>{error}</div> : null}
              {info ? <div style={{ color: colors.success, fontSize: 13 }}>{info}</div> : null}
              <button type="submit" className="saa-btn" style={{ justifyContent: 'center' }} disabled={loading}>{loading ? 'Sending…' : 'Send reset link'}</button>
              <button type="button" className="saa-btn saa-btn-ghost" style={{ justifyContent: 'center' }} onClick={() => { setMode('login'); setError(''); setInfo(''); }}>Back to sign in</button>
            </>
          ) : (
            <>
              <div>
                <label className="saa-label">New Password</label>
                <input className="saa-input" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} required minLength={6} placeholder="••••••••" />
              </div>
              {error ? <div style={{ color: colors.danger, fontSize: 13 }}>{error}</div> : null}
              {info ? <div style={{ color: colors.success, fontSize: 13 }}>{info}</div> : null}
              <button type="submit" className="saa-btn" style={{ justifyContent: 'center' }} disabled={loading}>{loading ? 'Resetting…' : 'Reset password'}</button>
              <button type="button" className="saa-btn saa-btn-ghost" style={{ justifyContent: 'center' }} onClick={() => { setMode('login'); setError(''); setInfo(''); }}>Back to sign in</button>
            </>
          )}
        </form>
        {getUser() ? <p style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 12 }}>Already signed in as {getUser()?.email}</p> : null}
      </div>
    </div>
  );
}