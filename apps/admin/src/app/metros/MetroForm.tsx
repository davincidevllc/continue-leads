'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface MetroFormProps {
  metro?: {
    id: string; name: string; state: string; slug: string;
    is_active: boolean; priority: number; facts: Record<string, unknown>;
  };
}

export default function MetroForm({ metro }: MetroFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    const data = {
      name: fd.get('name') as string,
      state: (fd.get('state') as string).toUpperCase(),
      slug: fd.get('slug') as string,
      priority: parseInt(fd.get('priority') as string) || 0,
      is_active: fd.get('is_active') === 'on',
      facts: (() => { try { return JSON.parse(fd.get('facts') as string); } catch { return {}; } })(),
    };

    const url = metro ? `/api/metros/${metro.id}` : '/api/metros';
    const method = metro ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (res.ok) {
      router.push('/metros');
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Failed to save');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="row g-3">
        <div className="col-md-4">
          <label className="form-label">Name</label>
          <input name="name" className="form-control" defaultValue={metro?.name} required />
        </div>
        <div className="col-md-2">
          <label className="form-label">State</label>
          <input name="state" className="form-control" maxLength={2} defaultValue={metro?.state} required />
        </div>
        <div className="col-md-4">
          <label className="form-label">Slug</label>
          <input name="slug" className="form-control" defaultValue={metro?.slug} required
            placeholder="e.g. boston-ma" />
        </div>
        <div className="col-md-2">
          <label className="form-label">Priority</label>
          <input name="priority" type="number" className="form-control" defaultValue={metro?.priority ?? 0} />
        </div>
      </div>
      <div className="mt-3">
        <label className="form-label">Facts (JSON)</label>
        <textarea name="facts" className="form-control font-monospace" rows={6}
          defaultValue={JSON.stringify(metro?.facts ?? {}, null, 2)} />
      </div>
      <div className="form-check mt-3">
        <input name="is_active" type="checkbox" className="form-check-input" id="is_active"
          defaultChecked={metro?.is_active ?? true} />
        <label className="form-check-label" htmlFor="is_active">Active</label>
      </div>
      <div className="mt-4">
        <button type="submit" className="btn btn-primary me-2" disabled={saving}>
          {saving ? 'Saving...' : metro ? 'Update Metro' : 'Create Metro'}
        </button>
        <button type="button" className="btn btn-outline-secondary" onClick={() => router.push('/metros')}>
          Cancel
        </button>
      </div>
    </form>
  );
}
