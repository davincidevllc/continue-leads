'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  site?: {
    id: string; domain: string; vertical_id: string; template_id: string;
    status: string; config: Record<string, unknown>;
  };
  verticals: { id: string; name: string }[];
  templates: { id: string; name: string }[];
  metros: { id: string; name: string; state: string }[];
  siteMetroIds?: string[];
}

export default function SiteForm({ site, verticals, templates, metros, siteMetroIds = [] }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedMetros, setSelectedMetros] = useState<string[]>(siteMetroIds);

  function toggleMetro(id: string) {
    setSelectedMetros(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    const data = {
      domain: fd.get('domain') as string,
      vertical_id: fd.get('vertical_id') as string,
      template_id: fd.get('template_id') as string,
      status: fd.get('status') as string || 'DRAFT',
      metro_ids: selectedMetros,
    };

    const url = site ? `/api/sites/${site.id}` : '/api/sites';
    const method = site ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (res.ok) { router.push('/sites'); router.refresh(); }
    else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Failed to save');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="mb-3">
        <label className="form-label">Domain</label>
        <input name="domain" className="form-control" defaultValue={site?.domain}
          placeholder="e.g. boston-painting.com" required />
      </div>
      <div className="row g-3 mb-3">
        <div className="col-md-4">
          <label className="form-label">Vertical</label>
          <select name="vertical_id" className="form-select" defaultValue={site?.vertical_id} required>
            <option value="">Select...</option>
            {verticals.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div className="col-md-4">
          <label className="form-label">Template</label>
          <select name="template_id" className="form-select" defaultValue={site?.template_id} required>
            <option value="">Select...</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {site && (
          <div className="col-md-4">
            <label className="form-label">Status</label>
            <select name="status" className="form-select" defaultValue={site.status}>
              {['DRAFT','REVIEW','APPROVED','PUBLISHED','ARCHIVED'].map(s =>
                <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label">Target Metros</label>
        <div className="row">
          {metros.map(m => (
            <div key={m.id} className="col-md-4">
              <div className="form-check">
                <input type="checkbox" className="form-check-input" id={`m_${m.id}`}
                  checked={selectedMetros.includes(m.id)} onChange={() => toggleMetro(m.id)} />
                <label className="form-check-label" htmlFor={`m_${m.id}`}>{m.name}, {m.state}</label>
              </div>
            </div>
          ))}
        </div>
      </div>
      <button type="submit" className="btn btn-primary me-2" disabled={saving}>
        {saving ? 'Saving...' : site ? 'Update Site' : 'Create Site'}
      </button>
      <button type="button" className="btn btn-outline-secondary" onClick={() => router.push('/sites')}>Cancel</button>
    </form>
  );
}
