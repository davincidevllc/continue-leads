import AuthLayout from '@/components/AuthLayout';
import { ActiveBadge } from '@/components/ui';
import { listMetros } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function MetrosPage() {
  const metros = await listMetros();

  return (
    <AuthLayout>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="mb-0">Metros</h4>
        <Link href="/metros/new" className="btn btn-primary btn-sm">+ Add Metro</Link>
      </div>
      <div className="card">
        <div className="card-body p-0">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>Name</th><th>State</th><th>Slug</th><th>Priority</th>
                <th>Sites</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {metros.map(m => (
                <tr key={m.id}>
                  <td className="fw-semibold">{m.name}</td>
                  <td>{m.state}</td>
                  <td><code>{m.slug}</code></td>
                  <td>{m.priority}</td>
                  <td>{m.site_count ?? 0}</td>
                  <td><ActiveBadge active={m.is_active} /></td>
                  <td>
                    <Link href={`/metros/${m.id}`} className="btn btn-outline-secondary btn-sm">Edit</Link>
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
