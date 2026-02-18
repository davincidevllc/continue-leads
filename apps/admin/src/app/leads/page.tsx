import AuthLayout from '@/components/AuthLayout';
import { StatusBadge, Pagination } from '@/components/ui';
import { listLeads, listVerticals, listMetros } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const limit = 25;
  const offset = parseInt(sp.offset ?? '0');
  const [verticals, metros] = await Promise.all([listVerticals(), listMetros()]);
  const { rows: leads, total } = await listLeads({
    status: sp.status || undefined,
    vertical_id: sp.vertical_id || undefined,
    metro_slug: sp.metro_slug || undefined,
    date_from: sp.date_from || undefined,
    date_to: sp.date_to || undefined,
    search: sp.search || undefined,
    limit, offset,
  });

  return (
    <AuthLayout>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="mb-0">Leads <span className="text-muted fs-6">({total})</span></h4>
      </div>

      <div className="card mb-3">
        <div className="card-body py-2">
          <form className="row g-2 align-items-end">
            <div className="col-md-2">
              <input name="search" className="form-control form-control-sm" placeholder="Search..."
                defaultValue={sp.search} />
            </div>
            <div className="col-md-2">
              <select name="status" className="form-select form-select-sm" defaultValue={sp.status}>
                <option value="">All Status</option>
                {['NEW','VALIDATED','QUALIFIED','QUEUED','OFFERED','SOLD','REJECTED','EXPIRED','UNSOLD'].map(s =>
                  <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <select name="vertical_id" className="form-select form-select-sm" defaultValue={sp.vertical_id}>
                <option value="">All Verticals</option>
                {verticals.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <select name="metro_slug" className="form-select form-select-sm" defaultValue={sp.metro_slug}>
                <option value="">All Metros</option>
                {metros.map(m => <option key={m.slug} value={m.slug}>{m.name}, {m.state}</option>)}
              </select>
            </div>
            <div className="col-auto">
              <input name="date_from" type="date" className="form-control form-control-sm" defaultValue={sp.date_from} />
            </div>
            <div className="col-auto">
              <input name="date_to" type="date" className="form-control form-control-sm" defaultValue={sp.date_to} />
            </div>
            <div className="col-auto">
              <button type="submit" className="btn btn-sm btn-outline-primary">Filter</button>
            </div>
            <div className="col-auto">
              <Link href="/leads" className="btn btn-sm btn-outline-secondary">Clear</Link>
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-body p-0">
          <table className="table table-hover table-sm mb-0">
            <thead className="table-light">
              <tr>
                <th>ID</th><th>Status</th><th>Vertical</th><th>Metro</th>
                <th>Domain</th><th>ZIP</th><th>Urgency</th><th>Created</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(l => (
                <tr key={l.id}>
                  <td>
                    <Link href={`/leads/${l.id}`} className="text-decoration-none font-monospace">
                      {l.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td><StatusBadge status={l.status} /></td>
                  <td>{l.vertical_name || '—'}</td>
                  <td>{l.metro_name || l.metro_slug || '—'}</td>
                  <td>{l.domain || '—'}</td>
                  <td>{l.zip || '—'}</td>
                  <td>{l.urgency || '—'}</td>
                  <td>{new Date(l.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr><td colSpan={8} className="text-center text-muted py-3">No leads found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-3">
        <Pagination total={total} limit={limit} offset={offset}
          baseUrl={`/leads?${new URLSearchParams(Object.fromEntries(Object.entries(sp).filter(([k]) => k !== 'offset'))).toString()}`} />
      </div>
    </AuthLayout>
  );
}
