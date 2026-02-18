import AuthLayout from '@/components/AuthLayout';
import { StatusBadge } from '@/components/ui';
import { getDashboardStats } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <AuthLayout>
      <h4 className="mb-4">Dashboard</h4>
      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <div className="card bg-primary text-white">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div><h6 className="card-subtitle mb-1 text-white-50">Total Leads</h6>
                  <h2 className="mb-0">{stats.total_leads}</h2></div>
                <div className="fs-1 opacity-50">📋</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-success text-white">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div><h6 className="card-subtitle mb-1 text-white-50">Leads Today</h6>
                  <h2 className="mb-0">{stats.leads_today}</h2></div>
                <div className="fs-1 opacity-50">📈</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-info text-white">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div><h6 className="card-subtitle mb-1 text-white-50">Sites</h6>
                  <h2 className="mb-0">{stats.total_sites}</h2></div>
                <div className="fs-1 opacity-50">🌐</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-warning text-dark">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div><h6 className="card-subtitle mb-1 text-dark">Active Metros</h6>
                  <h2 className="mb-0">{stats.active_metros}</h2></div>
                <div className="fs-1 opacity-50">🏙️</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-md-4">
          <div className="card">
            <div className="card-header fw-semibold">Leads by Status</div>
            <div className="card-body p-0">
              <table className="table table-sm mb-0">
                <tbody>
                  {stats.leads_by_status.map(r => (
                    <tr key={r.status}>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="text-end">{r.count}</td>
                    </tr>
                  ))}
                  {stats.leads_by_status.length === 0 && (
                    <tr><td colSpan={2} className="text-center text-muted py-3">No leads yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card">
            <div className="card-header fw-semibold">Leads by Vertical</div>
            <div className="card-body p-0">
              <table className="table table-sm mb-0">
                <tbody>
                  {stats.leads_by_vertical.map(r => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td className="text-end">{r.count}</td>
                    </tr>
                  ))}
                  {stats.leads_by_vertical.length === 0 && (
                    <tr><td colSpan={2} className="text-center text-muted py-3">No leads yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card">
            <div className="card-header fw-semibold">Recent Leads</div>
            <div className="card-body p-0">
              <table className="table table-sm mb-0">
                <tbody>
                  {stats.recent_leads.map(l => (
                    <tr key={l.id}>
                      <td><Link href={`/leads/${l.id}`} className="text-decoration-none">
                        {l.domain || 'direct'}</Link></td>
                      <td><StatusBadge status={l.status} /></td>
                    </tr>
                  ))}
                  {stats.recent_leads.length === 0 && (
                    <tr><td colSpan={2} className="text-center text-muted py-3">No leads yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
