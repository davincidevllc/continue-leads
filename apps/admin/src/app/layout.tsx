import type { Metadata } from 'next';
import 'bootstrap/dist/css/bootstrap.min.css';

export const metadata: Metadata = {
  title: 'Continue Leads Admin',
  description: 'Admin dashboard for Continue Leads CMS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-bs-theme="light">
      <body>
        {children}
      </body>
    </html>
  );
}
