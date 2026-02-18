'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Nav() {
  const path = usePathname();
  const links = [
    { href: '/', label: 'Dashboard', icon: '📊' },
    { href: '/metros', label: 'Metros', icon: '🏙️' },
    { href: '/verticals', label: 'Verticals', icon: '🔧' },
    { href: '/sites', label: 'Sites', icon: '🌐' },
    { href: '/leads', label: 'Leads', icon: '📋' },
  ];

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark mb-4">
      <div className="container-fluid">
        <Link href="/" className="navbar-brand fw-bold">
          ⚡ Continue Leads
        </Link>
        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav me-auto">
            {links.map(l => (
              <li key={l.href} className="nav-item">
                <Link href={l.href}
                  className={`nav-link ${path === l.href || (l.href !== '/' && path.startsWith(l.href)) ? 'active' : ''}`}>
                  {l.icon} {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <form action="/api/auth/logout" method="POST">
            <button className="btn btn-outline-light btn-sm" type="submit">Logout</button>
          </form>
        </div>
      </div>
    </nav>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    NEW: 'primary', VALIDATED: 'info', QUALIFIED: 'info',
    QUEUED: 'warning', OFFERED: 'warning', SOLD: 'success',
    REJECTED: 'danger', EXPIRED: 'secondary', UNSOLD: 'secondary',
    DRAFT: 'secondary', REVIEW: 'warning', APPROVED: 'info',
    PUBLISHED: 'success', ARCHIVED: 'dark',
  };
  return <span className={`badge bg-${colors[status] || 'secondary'}`}>{status}</span>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return <span className={`badge bg-${active ? 'success' : 'secondary'}`}>{active ? 'Active' : 'Inactive'}</span>;
}

export function Pagination({ total, limit, offset, baseUrl }: {
  total: number; limit: number; offset: number; baseUrl: string;
}) {
  const pages = Math.ceil(total / limit);
  const current = Math.floor(offset / limit);
  if (pages <= 1) return null;

  return (
    <nav>
      <ul className="pagination pagination-sm justify-content-center">
        {Array.from({ length: Math.min(pages, 10) }, (_, i) => (
          <li key={i} className={`page-item ${i === current ? 'active' : ''}`}>
            <Link href={`${baseUrl}${baseUrl.includes('?') ? '&' : '?'}offset=${i * limit}`}
              className="page-link">{i + 1}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
