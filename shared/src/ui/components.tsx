import React from 'react';

// ---------- Button ----------
export function Btn({
  children, variant, onClick, type = 'button', disabled, className,
}: {
  children: React.ReactNode; variant?: 'primary' | 'secondary' | 'danger';
  onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; className?: string;
}) {
  const cls = variant === 'secondary' ? 'saa-btn secondary' : variant === 'danger' ? 'saa-btn danger' : 'saa-btn';
  return (
    <button type={type} className={[cls, className].filter(Boolean).join(' ')} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

// ---------- Input ----------
export function Field({
  label, name, type = 'text', value, onChange, required, placeholder,
}: {
  label: string; name: string; type?: string; value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="saa-label">{label}</label>
      <input className="saa-input" type={type} name={name} value={value} onChange={onChange} required={required} placeholder={placeholder} />
    </div>
  );
}

export function SelectField({
  label, name, value, onChange, options, placeholder,
}: {
  label: string; name: string; value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[]; placeholder?: string;
}) {
  return (
    <div>
      <label className="saa-label">{label}</label>
      <select className="saa-select" name={name} value={value} onChange={onChange}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ---------- Stat card ----------
export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="saa-stat">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {hint ? <span style={{ fontSize: 12, color: '#6b7280' }}>{hint}</span> : null}
    </div>
  );
}

// ---------- Badge ----------
export function Badge({ tone, children }: { tone: 'green' | 'red' | 'amber' | 'slate'; children: React.ReactNode }) {
  return <span className={`saa-badge ${tone}`}>{children}</span>;
}

// ---------- Table ----------
export function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][]; }) {
  return (
    <table className="saa-table">
      <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
      </tbody>
    </table>
  );
}

// ---------- Empty state ----------
export function Empty({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="saa-card" style={{ textAlign: 'center', padding: 40 }}>
      <h3>{title}</h3>
      {subtitle ? <p style={{ color: '#6b7280' }}>{subtitle}</p> : null}
    </div>
  );
}

// ---------- Toast helper ----------
export function toast(msg: string) {
  const el = document.querySelector('[data-toast-root]');
  if (el) {
    const div = document.createElement('div');
    div.className = 'saa-toast';
    div.textContent = msg;
    el.appendChild(div);
    setTimeout(() => div.remove(), 4000);
  }
}

export function Page({ title, subtitle, actions, children }: {
  title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 className="saa-page-title">{title}</h1>
          {subtitle ? <p style={{ color: '#6b7280', margin: 0 }}>{subtitle}</p> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
      {children}
      <div data-toast-root />
    </div>
  );
}