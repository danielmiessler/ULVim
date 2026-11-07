// CI supply chain: every action a workflow runs is pinned to a full commit SHA, and every checkout
// leaves no credentials behind in the runner's git config.
//   bun tests/ci_pins.ts [ci-pins]
// Reads every workflow under .github/workflows and every action.yml under .github/actions.
// A `uses:` passes when it is local (./path), a docker image pinned by sha256 digest, or
// owner/repo[/path]@<40 hex>. A checkout passes when its `with` sets persist-credentials: false.
// Read-only. Exit 0 = pass.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SHA_PIN = /^[\w.-]+\/[\w.-]+(?:\/[^@\s]+)?@[0-9a-f]{40}$/;
const DOCKER_PIN = /^docker:\/\/[^@\s]+@sha256:[0-9a-f]{64}$/;

function yamlFiles(dir: string, match: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) found.push(...yamlFiles(p, match));
    else if (match(name)) found.push(p);
  }
  return found;
}

type Use = { uses: string; withs: Record<string, unknown> | undefined };

// Every mapping that carries a `uses` key, wherever it sits (steps, reusable-workflow jobs).
function collect(node: unknown, acc: Use[]): Use[] {
  if (Array.isArray(node)) for (const n of node) collect(n, acc);
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.uses === "string") acc.push({ uses: o.uses.trim(), withs: o.with as Record<string, unknown> | undefined });
    for (const v of Object.values(o)) collect(v, acc);
  }
  return acc;
}

const files = [
  ...yamlFiles(join(ROOT, ".github/workflows"), (n) => /\.ya?ml$/.test(n)),
  ...yamlFiles(join(ROOT, ".github/actions"), (n) => /^action\.ya?ml$/.test(n)),
];
const problems: string[] = [];
let total = 0;
let checkouts = 0;
for (const f of files) {
  const rel = relative(ROOT, f);
  const text = readFileSync(f, "utf8");
  let doc: unknown;
  try {
    doc = Bun.YAML.parse(text);
  } catch (e) {
    problems.push(`${rel}: YAML does not parse (${(e as Error).message})`);
    continue;
  }
  const uses = collect(doc, []);
  // A text count guards against a `uses:` the parsed walk missed (an anchor, an odd nesting).
  const textCount = (text.match(/^\s*(?:-\s+)?uses\s*:/gm) ?? []).length;
  if (textCount !== uses.length) problems.push(`${rel}: ${textCount} uses: lines but ${uses.length} parsed`);
  for (const u of uses) {
    total++;
    const local = u.uses.startsWith("./");
    if (!local && !SHA_PIN.test(u.uses) && !DOCKER_PIN.test(u.uses)) problems.push(`${rel}: not pinned to a commit SHA: ${u.uses}`);
    if (/^actions\/checkout@/.test(u.uses)) {
      checkouts++;
      const pc = u.withs?.["persist-credentials"];
      if (pc !== false && pc !== "false") problems.push(`${rel}: checkout without persist-credentials: false (${u.uses})`);
    }
  }
}
if (files.length === 0) problems.push("no workflow files under .github/workflows");

const arg = process.argv[2];
if (arg && arg !== "ci-pins") { console.log("usage: bun tests/ci_pins.ts [ci-pins]"); process.exit(2); }
const ok = problems.length === 0;
console.log(`${ok ? "PASS" : "FAIL"} ci-pins — ${files.length} files, ${total} uses, ${checkouts} checkouts${ok ? ", all SHA-pinned, no persisted credentials" : `; ${problems.join("; ")}`}`);
process.exit(ok ? 0 : 1);
