import { withAuthRead } from "@/lib/api-helpers";

const TRACKED_VARS = [
  "MONGODB_URI",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
];

function maskValue(val: string): string {
  if (val.length <= 8) return "••••••••";
  return val.slice(0, 4) + "••••" + val.slice(-4);
}

export const GET = withAuthRead(async () => {
  const envVars = TRACKED_VARS.map(name => {
    const val = process.env[name];
    return {
      name,
      set: Boolean(val),
      masked: val ? maskValue(val) : undefined,
    };
  }).filter(ev => ev.set || TRACKED_VARS.includes(ev.name));

  // Placeholder team members — replace with actual auth-provider logic
  const teamMembers: Array<{ name: string; role: string; email?: string }> = [];

  return { envVars, teamMembers };
}, "settings-get");
