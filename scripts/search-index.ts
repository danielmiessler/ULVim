// Builds the file index the ranked picker reads: one path per
// line for every searchable file, written atomically to the index path (SEARCH_INDEX, else <cache>/<NVIM_APPNAME>/search-index.txt).
//   bun scripts/search-index.ts   (search.lua passes SEARCH_ROOTS and SEARCH_INDEX)
// What is searchable comes from search-roots.local.json when it exists, else search-roots.json;
// see its _comment. Roots that do not exist are skipped.
import { existsSync, mkdirSync, readdirSync, realpathSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const HOME = process.env.HOME!;
const expand = (p: string) => p.replace(/^~/, HOME);
const LOCAL = join(import.meta.dir, "..", "search-roots.local.json");
const cfg = await Bun.file(process.env.SEARCH_ROOTS ?? (existsSync(LOCAL) ? LOCAL : join(import.meta.dir, "..", "search-roots.json"))).json();
const isDir = (p: string) => statSync(p, { throwIfNoEntry: false })?.isDirectory() ?? false;
const OUT = process.env.SEARCH_INDEX ?? join(HOME, ".cache", process.env.NVIM_APPNAME ?? "nvim", "search-index.txt");

// Exclude entries are folder names (one path component, * as a wildcard). They apply to folders
// only: a file whose own name matches ("build", "tmp") is still indexed.
const excludeRes: RegExp[] = (cfg.excludes ?? []).map(
  (e: string) => new RegExp("^" + e.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"),
);
const excludedName = (name: string) => excludeRes.some((re) => re.test(name));
// True when any folder on a file's relative path is excluded; the file name itself is not tested.
const inExcludedFolder = (rel: string) => rel.split("/").slice(0, -1).some(excludedName);

// A tool that fails is reported, never read as "no files".
function lines(cmd: string[]): string[] {
  const out = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
  if (out.exitCode !== 0) console.error(`search-index: ${cmd[0]} failed (exit ${out.exitCode}): ${out.stderr.toString().trim().split("\n")[0]}`);
  return out.stdout.toString().split("\n").filter(Boolean);
}

// Files in one project, as paths relative to it.
function projectFiles(dir: string): string[] {
  const gitPath = join(dir, ".git");
  if (existsSync(gitPath)) {
    // A .git file (not a directory) marks a linked worktree: a copy of a main repo.
    if (!statSync(gitPath).isDirectory()) return [];
    const out = Bun.spawnSync(["git", "-C", dir, "ls-files", "--cached", "--others", "--exclude-standard"], { stdout: "pipe", stderr: "pipe" });
    if (out.exitCode === 0) return out.stdout.toString().split("\n").filter(Boolean);
    // A .git folder git will not read (broken or foreign): index it as a plain folder instead.
  }
  if (HAS_FD) {
    return lines(["fd", ".", "--type", "f", "--hidden", "--base-directory", dir]).map((p) => p.replace(/^\.\//, ""));
  }
  // No fd: a plain walk that skips excluded folders.
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
      const r = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) { if (!excludedName(e.name)) walk(r); }
      else if (e.isFile()) out.push(r);
    }
  };
  walk("");
  return out;
}
const HAS_FD = Bun.which("fd") !== null;

const projects: string[] = (cfg.projects ?? []).map(expand).filter(isDir);
for (const c of (cfg.containers ?? []).map(expand).filter(isDir)) {
  for (const d of readdirSync(c)) {
    const p = join(c, d);
    if (!excludedName(d) && isDir(p)) projects.push(p);
  }
}
// One entry per real folder: a symlinked or case-insensitive alias (~/Projects and ~/projects
// on macOS) would otherwise list the same files twice.
{
  const seen = new Set<string>();
  const real = (p: string) => { try { return realpathSync.native(p); } catch { return p; } };
  const unique = projects.filter((p) => { const r = real(p); if (seen.has(r)) return false; seen.add(r); return true; });
  projects.splice(0, projects.length, ...unique);
}

// Media files are never edited in a text editor. The type comes from the
// standard extension-to-MIME table; SVG is XML text and stays.
const media = (p: string) => /^(image|audio|video|font)\//.test(Bun.file(p).type) && !Bun.file(p).type.includes("+xml");

const paths: string[] = [];
for (const dir of projects) {
  for (const rel of projectFiles(dir)) {
    if (!inExcludedFolder(rel) && (process.env.SEARCH_KEEP_MEDIA || !media(rel))) paths.push(join(dir, rel));
  }
}

mkdirSync(dirname(OUT), { recursive: true });
await Bun.write(OUT + ".tmp", paths.join("\n") + "\n");
renameSync(OUT + ".tmp", OUT);
console.error(`search-index: ${paths.length} files from ${projects.length} projects -> ${OUT}`);
