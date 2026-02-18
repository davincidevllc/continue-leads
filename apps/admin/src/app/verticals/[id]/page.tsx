import AuthLayout from '@/components/AuthLayout';
import VerticalForm from './VerticalForm';
import { getVertical, listServices } from '@/lib/db';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function EditVerticalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vertical = await getVertical(id);
  if (!vertical) notFound();
  const allServices = await listServices();
  const services = allServices.filter(s => s.vertical_slug === vertical.slug);

  return (
    <AuthLayout>
      <h4 className="mb-4">Edit Vertical: {vertical.name}</h4>
      <div className="row g-3">
        <div className="col-md-8">
          <div className="card"><div className="card-body"><VerticalForm vertical={vertical} /></div></div>
        </div>
        <div className="col-md-4">
          <div className="card">
            <div className="card-header fw-semibold">Services ({services.length})</div>
            <div className="card-body p-0">
              <table className="table table-sm mb-0">
                <tbody>
                  {services.map(s => (
                    <tr key={s.id}><td>{s.name}</td><td><code>{s.slug}</code></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
