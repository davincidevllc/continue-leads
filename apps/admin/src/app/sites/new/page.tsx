import AuthLayout from '@/components/AuthLayout';
import SiteForm from '../SiteForm';
import { listVerticals, listTemplates, listMetros } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function NewSitePage() {
  const [verticals, templates, metros] = await Promise.all([
    listVerticals(), listTemplates(), listMetros(),
  ]);

  return (
    <AuthLayout>
      <h4 className="mb-4">Create Site</h4>
      <div className="card"><div className="card-body">
        <SiteForm verticals={verticals} templates={templates} metros={metros} />
      </div></div>
    </AuthLayout>
  );
}
