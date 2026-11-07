// ISC-167: the finder index builds from the shipped search-roots.json in a home that lacks most
// of its roots, and lists every file in the roots that exist: a git repo, a plain folder (with fd
// and without it), and a folder whose .git git refuses. Nothing is indexed twice, and a tool that
// fails is reported, never read as "no files". Excludes name folders: a file whose own name is
// an excluded word ("build", "tmp") is still listed, and an excluded folder's files never are.
//   bun tests/search_index.ts
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const BUN = process.execPath;
const T = mkdtempSync(join(tmpdir(), "ulvim-idx-"));
const HOME = join(T, "home");
const put = (p: string, s = "x\n") => { mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, s); };

// ~/Projects exists; the other shipped roots (the config folder, ~/code, ~/src, ~/dev) do not.
put(join(HOME, "Projects/plain/notes.md"));
put(join(HOME, "Projects/plain/deep/a.lua"));
put(join(HOME, "Projects/plain/node_modules/skip.js"));
put(join(HOME, "Projects/plain/build/skip.js"));
put(join(HOME, "Projects/plain/tmp")); // a file named like an excluded folder
put(join(HOME, "Projects/repo/tracked.ts"));
Bun.spawnSync(["git", "init", "-q", join(HOME, "Projects/repo")]);
put(join(HOME, "Projects/repo/build"));
Bun.spawnSync(["git", "-C", join(HOME, "Projects/repo"), "add", "tracked.ts", "build"]);
put(join(HOME, "Projects/broken/real.md"));
mkdirSync(join(HOME, "Projects/broken/.git"), { recursive: true }); // an empty .git git will not read

const want = ["Projects/plain/notes.md", "Projects/plain/deep/a.lua", "Projects/plain/tmp", "Projects/repo/tracked.ts", "Projects/repo/build", "Projects/broken/real.md"].map((p) => join(HOME, p));
const fails: string[] = [];
for (const [label, PATH] of [["with fd", process.env.PATH ?? ""], ["without fd", "/usr/bin:/bin"]] as const) {
  const out = join(T, `idx-${label.replace(" ", "-")}.txt`);
  const p = Bun.spawnSync([BUN, join(ROOT, "scripts/search-index.ts")], {
    env: { HOME, PATH, SEARCH_ROOTS: join(ROOT, "search-roots.json"), SEARCH_INDEX: out },
    stderr: "pipe",
  });
  if (p.exitCode !== 0) { fails.push(`${label}: exit ${p.exitCode}: ${p.stderr.toString().trim().split("\n").pop()}`); continue; }
  const got = readFileSync(out, "utf8").split("\n").filter(Boolean);
  const missing = want.filter((w) => !got.includes(w));
  const dupes = got.length - new Set(got.map((g) => g.toLowerCase())).size;
  const skipped = got.some((g) => g.includes("/node_modules/") || g.includes("/build/"));
  if (missing.length || dupes || skipped) fails.push(`${label}: missing ${missing.length}, duplicates ${dupes}, excluded leaked ${skipped}`);
}
rmSync(T, { recursive: true, force: true });
console.log(fails.length ? `FAIL search-index — ${fails.join("; ")}` : `PASS search-index — ${want.length} of ${want.length} files with and without fd, no duplicates, excludes held on folders only`);
process.exit(fails.length ? 1 : 0);
