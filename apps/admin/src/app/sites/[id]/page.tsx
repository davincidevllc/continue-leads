import AuthLayout from '@/components/AuthLayout';
import SiteForm from '../SiteForm';
import { getSite, getSiteMetros, listVerticals, listTemplates, listMetros } from '@/lib/db';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function EditSitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [site, siteMetros, verticals, templates, metros] = await Promise.all([
    getSite(id), getSiteMetros(id), listVerticals(), listTemplates(), listMetros(),
  ]);
  if (!site) notFound();

  return (
    <AuthLayout>
      <h4 className="mb-4">Edit Site: {site.domain}</h4>
      <div className="card"><div className="card-body">
        <SiteForm site={site} verticals={verticals} templates={templates}
          metros={metros} siteMetroIds={siteMetros.map(m => m.id)} />
      </div></div>
    </AuthLayout>
  );
}
