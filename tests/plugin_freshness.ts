// ISC-126: no plugin in the lockfile has gone 12 months without a push, unless it is listed in
// tests/freshness-exempt.txt (or an ISA.md Decisions line "freshness-exempt: <owner/repo> — <why>").
//   bun tests/plugin_freshness.ts
// Reads GitHub through an authenticated `gh` when one is on PATH, else the public API: 60 calls an
// hour, or 5,000 with GITHUB_TOKEN set (CI provides one).
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const lock = (await Bun.file(join(ROOT, "nvim-pack-lock.json")).json()).plugins as Record<string, { src: string }>;
let exempt = await Bun.file(join(ROOT, "tests/freshness-exempt.txt")).text();
if (existsSync(join(ROOT, "ISA.md"))) exempt += await Bun.file(join(ROOT, "ISA.md")).text();
const isExempt = (repo: string) => exempt.split("\n").some((l) => l.trim().startsWith(repo + " ") || l.includes(`freshness-exempt: ${repo} `));
// Bun.spawnSync throws when the program is not on PATH, so gh is looked up before it is ever run.
const GH = Bun.which("gh");
const ghOk = GH !== null && Bun.spawnSync([GH, "auth", "status"], { stdout: "ignore", stderr: "ignore" }).exitCode === 0;

// The repo's last push as an ISO timestamp, or why it could not be read. Only an ISO timestamp
// counts as an answer: Date.parse would read an error text such as "HTTP 403" as the year 403.
async function pushedAt(repo: string): Promise<{ at: string } | { err: string }> {
  let out: string;
  if (ghOk && GH) {
    const p = Bun.spawnSync([GH, "api", `repos/${repo}`, "--jq", ".pushed_at"], { stdout: "pipe", stderr: "pipe" });
    out = p.exitCode === 0 ? p.stdout.toString().trim() : `gh api: ${p.stderr.toString().trim().split("\n")[0]}`;
  } else {
    const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "ulvim-freshness-check" };
    if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const r = await fetch(`https://api.github.com/repos/${repo}`, { headers });
    if (!r.ok) {
      const limited = r.headers.get("x-ratelimit-remaining") === "0";
      return { err: `HTTP ${r.status}${limited ? ", public API rate limit reached: log in to gh or retry after the hourly reset" : ""}` };
    }
    out = String(((await r.json()) as { pushed_at?: string }).pushed_at ?? "");
  }
  return /^\d{4}-\d{2}-\d{2}T/.test(out) ? { at: out } : { err: out || "no answer" };
}

const YEAR = 365 * 24 * 3600 * 1000;
const stale: string[] = [];
const unreadable = new Map<string, string[]>(); // reason -> repos
for (const { src } of Object.values(lock)) {
  const repo = src.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  const res = await pushedAt(repo);
  if ("err" in res) { unreadable.set(res.err, [...(unreadable.get(res.err) ?? []), repo]); continue; }
  if (Date.now() - Date.parse(res.at) > YEAR && !isExempt(repo)) stale.push(`${repo} (last push ${res.at.slice(0, 10)})`);
}
for (const [why, repos] of unreadable) stale.push(`${repos.length === Object.keys(lock).length ? "all plugins" : repos.join(", ")} unreadable (${why})`);
const via = ghOk ? "gh" : `public API${process.env.GITHUB_TOKEN ? " with GITHUB_TOKEN" : ""}`;
console.log(stale.length ? `FAIL via ${via}: ${stale.join("; ")}` : `PASS ${Object.keys(lock).length} plugins fresh or exempt (${via})`);
process.exit(stale.length ? 1 : 0);
