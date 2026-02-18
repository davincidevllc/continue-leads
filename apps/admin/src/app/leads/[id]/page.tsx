import AuthLayout from '@/components/AuthLayout';
import { StatusBadge } from '@/components/ui';
import { getLead, getLeadDetails, getLeadEvents } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [lead, details, events] = await Promise.all([
    getLead(id), getLeadDetails(id), getLeadEvents(id),
  ]);
  if (!lead) notFound();

  return (
    <AuthLayout>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="mb-0">
          Lead <code className="fs-6">{lead.id.slice(0, 8)}</code>
          <span className="ms-2"><StatusBadge status={lead.status} /></span>
        </h4>
        <Link href="/leads" className="btn btn-outline-secondary btn-sm">← Back to Leads</Link>
      </div>

      <div className="row g-3">
        <div className="col-md-8">
          <div className="card mb-3">
            <div className="card-header fw-semibold">Lead Info</div>
            <div className="card-body">
              <table className="table table-sm">
                <tbody>
                  <tr><th style={{width:'35%'}}>ID</th><td><code>{lead.id}</code></td></tr>
                  <tr><th>Status</th><td><StatusBadge status={lead.status} /></td></tr>
                  {lead.rejection_reason && <tr><th>Rejection Reason</th><td className="text-danger">{lead.rejection_reason}</td></tr>}
                  <tr><th>Dedupe Hit</th><td>{lead.dedupe_hit ? '⚠️ Yes' : '✅ No'}</td></tr>
                  <tr><th>Vertical</th><td>{lead.vertical_name || '—'}</td></tr>
                  <tr><th>Metro</th><td>{lead.metro_name || lead.metro_slug || '—'}</td></tr>
                  <tr><th>ZIP</th><td>{lead.zip || '—'}</td></tr>
                  <tr><th>Domain</th><td>{lead.domain || '—'}</td></tr>
                  <tr><th>Urgency</th><td>{lead.urgency || '—'}</td></tr>
                  <tr><th>Property Type</th><td>{lead.property_type || '—'}</td></tr>
                  <tr><th>Created</th><td>{new Date(lead.created_at).toLocaleString()}</td></tr>
                  <tr><th>Updated</th><td>{new Date(lead.updated_at).toLocaleString()}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {details && Object.keys(details.responses).length > 0 && (
            <div className="card mb-3">
              <div className="card-header fw-semibold">Qualifying Responses</div>
              <div className="card-body">
                <table className="table table-sm">
                  <tbody>
                    {Object.entries(details.responses).map(([k, v]) => (
                      <tr key={k}><th style={{width:'35%'}}>{k}</th><td>{String(v)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="col-md-4">
          <div className="card">
            <div className="card-header fw-semibold">Status Timeline</div>
            <div className="card-body p-0">
              {events.length > 0 ? (
                <ul className="list-group list-group-flush">
                  {events.map(e => (
                    <li key={e.id} className="list-group-item">
                      <div className="d-flex justify-content-between">
                        <div>
                          {e.from_status && <><StatusBadge status={e.from_status} />{' → '}</>}
                          <StatusBadge status={e.to_status} />
                        </div>
                        <small className="text-muted">
                          {new Date(e.created_at).toLocaleTimeString()}
                        </small>
                      </div>
                      {e.reason && <small className="text-muted d-block mt-1">{e.reason}</small>}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center text-muted py-3">No events recorded</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
