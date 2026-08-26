// Shared design tokens consumed by every dashboard for a consistent look.
export const colors = {
  primary: '#4f46e5',
  primaryDark: '#4338ca',
  secondary: '#0ea5e9',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
  muted: '#6b7280',
  surface: '#ffffff',
  surfaceAlt: '#f8fafc',
  border: '#e5e7eb',
  text: '#111827',
  textMuted: '#6b7280',
  sidebar: '#4338ca',
  sidebarMuted: '#c7d2fe',
};

export const roleBanners: Record<string, { label: string; color: string }> = {
  SUPER_ADMIN: { label: 'Platform Admin', color: '#dc2626' },
  SCHOOL_ADMIN: { label: 'School Admin', color: '#4f46e5' },
  PRINCIPAL: { label: 'Principal', color: '#7c3aed' },
  TEACHER: { label: 'Teacher', color: '#0ea5e9' },
  PARENT: { label: 'Parent', color: '#d97706' },
  STUDENT: { label: 'Student', color: '#16a34a' },
  STAFF: { label: 'Staff', color: '#6b7280' },
};

export const formats = {
  date: (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—'),
  money: (n: number | string | null | undefined, currency = '₹') =>
    `${currency}${Number(n || 0).toLocaleString('en-IN')}`,
  pct: (n: number | string | null | undefined) => `${Math.round(Number(n || 0))}%`,
};