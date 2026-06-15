import { headers } from 'next/headers';
import LoginForm from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const h = await headers();
  const subdomainType =
    (h.get('x-cl-subdomain-type') as 'admin' | 'tenant' | 'apex' | 'unknown' | null) ?? 'admin';
  const subdomainSlug = h.get('x-cl-subdomain-slug') ?? null;

  return <LoginForm subdomainType={subdomainType} subdomainSlug={subdomainSlug} />;
}
