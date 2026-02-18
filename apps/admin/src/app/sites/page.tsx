import AuthLayout from '@/components/AuthLayout';
import { StatusBadge, Pagination } from '@/components/ui';
import { listSites, listVerticals } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function SitesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const limit = 25;
  const offset = parseInt(sp.offset ?? '0');
  const verticals = await listVerticals();
  const { rows: sites, total } = await listSites({
    status: sp.status || undefined,
    vertical_id: sp.vertical_id || undefined,
    search: sp.search || undefined,
    limit, offset,
  });

  const filterUrl = (key: string, val: string) => {
    const p = new URLSearchParams(sp);
    if (val) p.set(key, val); else p.delete(key);
    p.delete('offset');
    return `/sites?${p.toString()}`;
  };

  return (
    <AuthLayout>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="mb-0">Sites <span className="text-muted fs-6">({total})</span></h4>
        <Link href="/sites/new" className="btn btn-primary btn-sm">+ Create Site</Link>
      </div>

      <div className="card mb-3">
        <div className="card-body py-2">
          <form className="row g-2 align-items-end">
            <div className="col-md-3">
              <input name="search" className="form-control form-control-sm" placeholder="Search domains..."
                defaultValue={sp.search} />
            </div>
            <div className="col-md-2">
              <select name="status" className="form-select form-select-sm" defaultValue={sp.status}>
                <option value="">All Status</option>
                {['DRAFT','REVIEW','APPROVED','PUBLISHED','ARCHIVED'].map(s =>
                  <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <select name="vertical_id" className="form-select form-select-sm" defaultValue={sp.vertical_id}>
                <option value="">All Verticals</option>
                {verticals.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="col-auto">
              <button type="submit" className="btn btn-sm btn-outline-primary">Filter</button>
            </div>
            <div className="col-auto">
              <Link href="/sites" className="btn btn-sm btn-outline-secondary">Clear</Link>
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-body p-0">
          <table className="table table-hover table-sm mb-0">
            <thead className="table-light">
              <tr>
                <th>Domain</th><th>Vertical</th><th>Template</th>
                <th>Status</th><th>Metros</th><th>Leads</th><th>Created</th><th></th>
              </tr>
            </thead>
            <tbody>
              {sites.map(s => (
                <tr key={s.id}>
                  <td className="fw-semibold">{s.domain}</td>
                  <td>{s.vertical_name}</td>
                  <td>{s.template_name}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td>{s.metro_count ?? 0}</td>
                  <td>{s.lead_count ?? 0}</td>
                  <td>{new Date(s.created_at).toLocaleDateString()}</td>
                  <td>
                    <Link href={`/sites/${s.id}`} className="btn btn-outline-secondary btn-sm">Edit</Link>
                  </td>
                </tr>
              ))}
              {sites.length === 0 && (
                <tr><td colSpan={8} className="text-center text-muted py-3">No sites found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-3">
        <Pagination total={total} limit={limit} offset={offset}
          baseUrl={`/sites?${new URLSearchParams(Object.fromEntries(Object.entries(sp).filter(([k]) => k !== 'offset'))).toString()}`} />
      </div>
    </AuthLayout>
  );
}
