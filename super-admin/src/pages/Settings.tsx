import { Page, Btn } from '../services/api';

export default function Settings() {
  return (
    <Page title="System Settings" subtitle="Platform-wide configuration">
      <div className="saa-card" style={{ maxWidth: 640, display: 'grid', gap: 12 }}>
        <p><b>Platform Status:</b> Healthy</p>
        <p><b>API:</b> Centralized REST backend</p>
        <p><b>Database:</b> PostgreSQL (multi-tenant)</p>
        <p><b>Seed Permissions:</b> Use the backend POST <code>/api/permissions/seed</code> once permissions are cataloged.</p>
        <div><Btn onClick={() => window.open('/api/health', '_blank')}>Health Check</Btn></div>
      </div>
    </Page>
  );
}