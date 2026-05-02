import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// Capture the build-time git SHA so the dashboard footer can show it.
// Falls back to 'unknown' in environments without git (e.g. Docker without
// the git history mounted).
let commitSha = "unknown";
try {
  commitSha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
} catch {
  /* noop */
}

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  env: {
    NEXT_PUBLIC_COMMIT_SHA: commitSha,
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

export default nextConfig;
