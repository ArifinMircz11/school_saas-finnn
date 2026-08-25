import React from 'react';
import { ChildInfo } from '../lib/ChildContext';

/** Reusable child selector shown on multi-child pages. */
export function ChildPicker({ children, active, onSelect }: { children: ChildInfo[]; active: ChildInfo | null; onSelect: (c: ChildInfo) => void }) {
  if (!children || children.length <= 1) return null;
  return (
    <div className="saa-card" style={{ marginBottom: 16 }}>
      <b style={{ fontSize: 14 }}>Select Child:</b>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {children.map((c) => (
          <button key={c.student.id} onClick={() => onSelect(c)}
            style={{
              padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
              border: c.student.id === active?.student.id ? '2px solid #4f46e5' : '1px solid #e5e7eb',
              background: c.student.id === active?.student.id ? '#eef2ff' : '#fff',
            }}>
            <b>{c.student.firstName}</b>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{c.student.class?.name}-{c.student.section?.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}