/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

// Wrap with Sentry config only if SENTRY_DSN is configured. This keeps the
// build working in local dev and in environments where Sentry hasn't been
// provisioned yet — useful for the first deploy of MON-1 where the DSN
// hasn't been added to Secrets Manager.
if (process.env.SENTRY_DSN) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { withSentryConfig } = require('@sentry/nextjs');
  module.exports = withSentryConfig(nextConfig, {
    // Sentry org + project slugs come from the Sentry dashboard.
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    // Auth token is only required if uploading source maps. Skipped when absent.
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: true,
    hideSourceMaps: true,
    disableLogger: true,
    automaticVercelMonitors: false,
  });
} else {
  module.exports = nextConfig;
}
