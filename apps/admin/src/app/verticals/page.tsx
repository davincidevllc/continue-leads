import AuthLayout from '@/components/AuthLayout';
import { ActiveBadge } from '@/components/ui';
import { listVerticals } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function VerticalsPage() {
  const verticals = await listVerticals();

  return (
    <AuthLayout>
      <h4 className="mb-4">Verticals</h4>
      <div className="card">
        <div className="card-body p-0">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>Name</th><th>Slug</th><th>Dedupe Window</th>
                <th>Services</th><th>Leads</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {verticals.map(v => (
                <tr key={v.id}>
                  <td className="fw-semibold">{v.name}</td>
                  <td><code>{v.slug}</code></td>
                  <td>{v.dedupe_window_days} days</td>
                  <td>{v.service_count ?? 0}</td>
                  <td>{v.lead_count ?? 0}</td>
                  <td><ActiveBadge active={v.is_active} /></td>
                  <td>
                    <Link href={`/verticals/${v.id}`} className="btn btn-outline-secondary btn-sm">Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AuthLayout>
  );
}
