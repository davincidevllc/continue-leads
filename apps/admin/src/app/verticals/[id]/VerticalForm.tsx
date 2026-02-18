'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  vertical: {
    id: string; name: string; dedupe_window_days: number;
    required_fields: Record<string, boolean>; is_active: boolean;
  };
}

export default function VerticalForm({ vertical }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState(vertical.required_fields);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    const data = {
      name: fd.get('name') as string,
      dedupe_window_days: parseInt(fd.get('dedupe_window_days') as string),
      is_active: fd.get('is_active') === 'on',
      required_fields: fields,
    };
    const res = await fetch(`/api/verticals/${vertical.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (res.ok) { router.push('/verticals'); router.refresh(); }
    else { setError('Failed to save'); setSaving(false); }
  }

  function toggleField(key: string) {
    setFields(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="mb-3">
        <label className="form-label">Name</label>
        <input name="name" className="form-control" defaultValue={vertical.name} required />
      </div>
      <div className="mb-3">
        <label className="form-label">Dedupe Window (days)</label>
        <input name="dedupe_window_days" type="number" className="form-control" min={1} max={90}
          defaultValue={vertical.dedupe_window_days} required />
        <div className="form-text">Leads from the same phone/email within this window are flagged as dupes.</div>
      </div>
      <div className="mb-3">
        <label className="form-label">Required Fields</label>
        {Object.entries(fields).map(([key, val]) => (
          <div key={key} className="form-check">
            <input type="checkbox" className="form-check-input" id={`rf_${key}`}
              checked={val} onChange={() => toggleField(key)} />
            <label className="form-check-label" htmlFor={`rf_${key}`}>{key}</label>
          </div>
        ))}
      </div>
      <div className="form-check mb-3">
        <input name="is_active" type="checkbox" className="form-check-input" id="is_active"
          defaultChecked={vertical.is_active} />
        <label className="form-check-label" htmlFor="is_active">Active</label>
      </div>
      <button type="submit" className="btn btn-primary me-2" disabled={saving}>
        {saving ? 'Saving...' : 'Update Vertical'}
      </button>
      <button type="button" className="btn btn-outline-secondary" onClick={() => router.push('/verticals')}>Cancel</button>
    </form>
  );
}
