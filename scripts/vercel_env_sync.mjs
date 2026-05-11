import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const requiredKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SARVAM_API_KEY"
];

const environments = process.argv.slice(2);
if (!environments.length) environments.push("production");

function readEnv() {
  const env = new Map();
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").trim().replace(/^['"]|['"]$/g, "");
    env.set(key.trim(), value);
  }
  return env;
}

const localEnv = readEnv();
for (const key of requiredKeys) {
  const value = localEnv.get(key);
  if (!value) {
    throw new Error(`${key} is missing in .env`);
  }
  for (const environment of environments) {
    const args = ["vercel", "env", "add", key, environment];
    if (environment === "preview") {
      const previewBranch = process.env.VERCEL_PREVIEW_BRANCH;
      if (!previewBranch) {
        throw new Error("Set VERCEL_PREVIEW_BRANCH to a non-production branch before syncing preview env vars.");
      }
      args.push(previewBranch);
    }
    args.push("--force", "--yes");
    const result = spawnSync(
      "npx",
      args,
      {
        input: value,
        stdio: ["pipe", "inherit", "inherit"]
      }
    );
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}
