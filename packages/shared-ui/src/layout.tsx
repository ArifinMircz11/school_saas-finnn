import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, clearSession, getUser, useUnreadCount } from '@saas/api-client';
import { colors, roleBanners } from './tokens';

export interface NavItem { to: string; label: string; icon?: string; }

export function Layout({ brand, brandShort, menu, roleKey, children }: {
  brand: string; brandShort?: string; menu: NavItem[]; roleKey: string; children: React.ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const unread = roleKey !== 'SUPER_ADMIN' ? useUnreadCount() : 0;
  const user = getUser();
  const banner = roleBanners[roleKey];
  const sidebarWidth = 250;
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const logout = async () => {
    const refresh = localStorage.getItem('saa_refresh');
    if (refresh) await api('/auth/logout', { method: 'POST', body: { refreshToken: refresh } });
    clearSession();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarWidth, background: colors.sidebar, color: '#fff', flexShrink: 0, padding: '20px 0',
        position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 50, overflowY: 'auto',
        transform: isMobile && !open ? `translateX(-${sidebarWidth}px)` : 'translateX(0)',
        transition: 'transform 0.2s ease-in-out',
      }}>
        <div style={{ padding: '0 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>{brandShort || '🎓'}</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{brand}</span>
        </div>
        <nav style={{ paddingTop: 12 }}>
          {menu.map((item) => {
            const active = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));
            return (
              <Link key={item.to} to={item.to}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
                  color: active ? '#fff' : colors.sidebarMuted, fontWeight: active ? 600 : 400,
                  background: active ? 'rgba(255,255,255,0.14)' : 'transparent', borderLeft: active ? `3px solid #fff` : '3px solid transparent',
                }}>
                <span>{item.icon || '•'}</span><span style={{ fontSize: 14 }}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile overlay — closes sidebar when tapping the backdrop */}
      {isMobile && open ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 45 }} onClick={() => setOpen(false)} />
      ) : null}

      {/* Main — marginLeft now matches sidebar width (was 220, causing 30px content overlap) */}
      <div style={{ marginLeft: isMobile ? 0 : sidebarWidth, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Topbar */}
        <header style={{ height: 56, background: '#fff', borderBottom: '1px solid ' + colors.border, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'sticky', top: 0, zIndex: 55 }}>
          {isMobile ? <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>☰</button> : <div style={{ width: 32 }} />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {banner ? <span style={{ background: banner.color, color: '#fff', borderRadius: 999, padding: '2px 12px', fontSize: 12 }}>{banner.label}</span> : null}
            <Bell unread={unread} />
            <span style={{ fontSize: 13, color: colors.textMuted }}>{user?.firstName} {user?.lastName}</span>
            <button onClick={logout} style={{ background: 'none', border: 'none', color: colors.danger, fontSize: 13, cursor: 'pointer' }}>Logout</button>
          </div>
        </header>
        <main style={{ padding: 24, flex: 1 }}>{children}</main>
      </div>
    </div>
  );
}

function Bell({ unread }: { unread: number }) {
  const [panel, setPanel] = useState(false);
  const [list, setList] = useState<any[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setPanel(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const toggle = async () => {
    setPanel(!panel);
    if (!panel) {
      const res = await api<any[]>('/notifications');
      if (res.success) setList(res.data || []);
    }
  };
  const openAll = () => { navigate('/notifications'); };

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button onClick={toggle} style={{ position: 'relative', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>
        🔔
        {unread > 0 ? <span style={{ position: 'absolute', top: -4, right: -6, background: colors.danger, color: '#fff', borderRadius: 999, fontSize: 10, padding: '1px 5px' }}>{unread}</span> : null}
      </button>
      {panel ? (
        <div style={{ position: 'absolute', right: 0, top: 32, width: 320, background: '#fff', border: '1px solid ' + colors.border, borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.15)', zIndex: 60, maxHeight: 380, overflow: 'auto' }}>
          <div style={{ padding: 10, borderBottom: '1px solid ' + colors.border, fontWeight: 600 }}>Notifications</div>
          {list.length === 0 ? <div style={{ padding: 16, color: colors.textMuted, fontSize: 13 }}>No notifications</div> : list.map((n) => (
            <div key={n.id} style={{ padding: '10px 12px', borderBottom: '1px solid ' + colors.border }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</div>
              <div style={{ fontSize: 12, color: colors.textMuted }}>{n.message}</div>
            </div>
          ))}
          <button onClick={openAll} style={{ width: '100%', padding: 10, background: '#f8fafc', border: 'none', cursor: 'pointer', fontSize: 13, color: colors.primary }}>View all</button>
        </div>
      ) : null}
    </div>
  );
}
