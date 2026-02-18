import { Nav } from '@/components/ui';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <div className="container-fluid px-4">
        {children}
      </div>
    </>
  );
}
