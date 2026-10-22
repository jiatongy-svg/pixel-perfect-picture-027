import type { NextConfig } from "next";

// Next.js settings. We keep this tiny on purpose.
const nextConfig: NextConfig = {
  // Profile photos are uploaded straight from the browser to Supabase Storage,
  // so server actions only ever receive small form posts.
  poweredByHeader: false,
};

export default nextConfig;
