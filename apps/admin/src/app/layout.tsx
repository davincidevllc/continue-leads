export const metadata = {
  title: 'Continue Leads Admin',
  description: 'Admin dashboard for Continue Leads CMS',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
