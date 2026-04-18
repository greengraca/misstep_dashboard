import { withAuthRead } from "@/lib/api-helpers";
import { getTeamMembers } from "@/lib/team";

// Vars that are actually read somewhere in this codebase. Grouped by role
// so the Settings panel can explain why each one matters.
const TRACKED_VARS: { name: string; required: boolean }[] = [
  { name: "MONGODB_URI", required: true },
  { name: "MONGODB_DB_NAME", required: false },
  { name: "APP_PIN", required: true },
  { name: "NEXTAUTH_SECRET", required: true },
  { name: "GITHUB_TOKEN", required: false },
  { name: "EXT_REPO", required: false },
  { name: "EXT_DOWNLOAD_URL", required: false },
  { name: "HUNTINGGROUNDS_MONGODB_URI", required: false },
  // Storage hardware — read by the upcoming /api/storage/light publisher.
  // Not required until the ESP32/MQTT stack is online; tracked here so
  // Settings surfaces whether they're configured.
  { name: "MQTT_BROKER_URL", required: false },
  { name: "MQTT_USERNAME", required: false },
  { name: "MQTT_PASSWORD", required: false },
];

function maskValue(val: string): string {
  if (val.length <= 8) return "••••••••";
  return val.slice(0, 4) + "••••" + val.slice(-4);
}

export const GET = withAuthRead(async () => {
  const envVars = TRACKED_VARS.map(({ name, required }) => {
    const val = process.env[name];
    return {
      name,
      required,
      set: Boolean(val),
      masked: val ? maskValue(val) : undefined,
    };
  });

  const teamMembers = await getTeamMembers();

  return { envVars, teamMembers };
}, "settings-get");
