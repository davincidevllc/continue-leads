import AuthLayout from '@/components/AuthLayout';
import MetroForm from '../MetroForm';
import { getMetro } from '@/lib/db';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function EditMetroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const metro = await getMetro(id);
  if (!metro) notFound();

  return (
    <AuthLayout>
      <h4 className="mb-4">Edit Metro: {metro.name}</h4>
      <div className="card"><div className="card-body"><MetroForm metro={metro} /></div></div>
    </AuthLayout>
  );
}
