'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  subdomainType: 'admin' | 'tenant' | 'apex' | 'unknown';
  subdomainSlug: string | null;
};

export default function LoginForm({ subdomainType, subdomainSlug }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const isTenant = subdomainType === 'tenant';
  const endpoint = isTenant ? '/api/tenant-auth/login' : '/api/platform-auth/login';
  const headline = isTenant
    ? `Sign in to ${subdomainSlug ?? 'tenant'}`
    : 'Sign in to Continue Leads';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        router.push('/');
        router.refresh();
      } else {
        setError(data?.error ?? 'Sign in failed');
        setLoading(false);
      }
    } catch {
      setError('Network error');
      setLoading(false);
    }
  }

  return (
    <div className="d-flex align-items-center justify-content-center vh-100 bg-dark">
      <div className="card shadow" style={{ width: '380px' }}>
        <div className="card-body p-4">
          <h4 className="card-title text-center mb-1">⚡ Continue Leads</h4>
          <p className="text-muted text-center small mb-4">{headline}</p>
          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-3">
              <label htmlFor="email" className="form-label">Email</label>
              <input
                type="email"
                id="email"
                className="form-control"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="username"
                autoFocus
                required
              />
            </div>
            <div className="mb-3">
              <label htmlFor="password" className="form-label">Password</label>
              <input
                type="password"
                id="password"
                className="form-control"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
            {error && <div className="alert alert-danger py-2 small mb-3">{error}</div>}
            <button
              type="submit"
              className="btn btn-primary w-100"
              disabled={loading || !email || !password}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
