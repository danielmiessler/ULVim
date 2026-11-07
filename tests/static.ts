// Static checks over the repo. Usage: bun tests/static.ts <check> [arg]
// Exit 0 = pass. Runs from the repo root.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === ".harness") continue;
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const files = (sub = "") => walk(join(ROOT, sub));
const rel = (p: string) => relative(ROOT, p);
const read = (p: string) => readFileSync(p, "utf8");
const lock = (): Record<string, unknown> => JSON.parse(read(join(ROOT, "nvim-pack-lock.json"))).plugins ?? {};
const grep = (re: RegExp, ps: string[]) => ps.filter((p) => re.test(read(p)));
const notInLock = (re: RegExp) => Object.keys(lock()).filter((k) => re.test(k));

const checks: Record<string, (arg?: string) => [boolean, string]> = {
  "single-pack-add": () => {
    const hits = grep(/vim\.pack\.add\s*\(/, files("lua"));
    return [hits.length === 1 && rel(hits[0]) === "lua/ulvim/plugins/init.lua", hits.map(rel).join(", ")];
  },
  "no-lazyvim": () => {
    const hits = grep(/lazyvim|lazy\.nvim|VeryLazy/i, files().filter((p) => !/(^|\/)(ISA\.md|extraction\.md|README\.md|CHECKS\.md)$/.test(p) && !rel(p).startsWith("docs/") && !rel(p).startsWith("tests/") && !rel(p).startsWith("tools/")));
    return [hits.length === 0, hits.map(rel).join(", ") || "none"];
  },
  "snacks-adapter-only": () => {
    const hits = grep(/snacks\.picker\.(core|source)/, files("lua")).filter((p) => rel(p) !== "lua/ulvim/search/snacks_adapter.lua");
    return [hits.length === 0, hits.map(rel).join(", ") || "none"];
  },
  "no-python-files": () => {
    const hits = files().filter((p) => p.endsWith(".py"));
    return [hits.length === 0, hits.map(rel).join(", ") || "none"];
  },
  "no-python-calls": () => {
    // A line that runs something (popen, execute, system, jobstart, termopen, vim.cmd, !) and
    // names python. A tree-sitter parser name in a list runs nothing.
    const hits = grep(/(popen|execute|system|jobstart|termopen|vim\.cmd|:!|["']!)[^\n]*\bpython3?\b/, files("lua"));
    return [hits.length === 0, hits.map(rel).join(", ") || "none"];
  },
  "no-completion-plugin": () => {
    const hits = notInLock(/cmp|blink|copilot|snippet|luasnip|completion/i);
    return [hits.length === 0, hits.join(", ") || "none"];
  },
  "no-config-path": () => {
    // Only the installer and the tests that check the link it makes may name that path.
    const owners = ["static.ts", "cutover.ts", "shell.ts", "scripts/install.ts"];
    const hits = grep(/\.config\/nvim/, [...files("lua"), ...files("scripts"), ...files("tests")].filter((p) => !owners.some((o) => p.endsWith(o))));
    return [hits.length === 0, hits.map(rel).join(", ") || "none"];
  },
  "no-bare-chrome": () => {
    const hits = grep(/open["', ]+-a["', ]+Google Chrome/, files("lua"));
    return [hits.length === 0, hits.map(rel).join(", ") || "none"];
  },
  "one-color-owner": () => {
    const hits = grep(/nvim_set_hl\s*\(/, files("lua")).filter((p) => rel(p) !== "lua/ulvim/colors.lua");
    return [hits.length === 0, hits.map(rel).join(", ") || "none"];
  },
  "nvim-version": (min = "0.12.6") => {
    const v = Bun.spawnSync(["nvim", "--version"]).stdout.toString().match(/NVIM v(\d+)\.(\d+)\.(\d+)/);
    const [a, b, c] = min.split(".").map(Number);
    const ok = !!v && (Number(v[1]) * 1e6 + Number(v[2]) * 1e3 + Number(v[3])) >= a * 1e6 + b * 1e3 + c;
    return [ok, v?.[0] ?? "no nvim"];
  },
  "no-binary-history": () => {
    // Binary stores named in code, or a snacks source that writes its SQLite frecency store
    // (smart and recent default frecency on; only an explicit frecency = false keeps it off).
    const hits = grep(/sqlite|lmdb|\.dat\b|picker\.recent|picker\.smart|source\s*=\s*["'](recent|smart)["']|frecency\s*=\s*true/i, files("lua"));
    const adapter = read(join(ROOT, "lua/ulvim/search/snacks_adapter.lua"));
    const usesSnacksFrecency = /frecency/.test(adapter);
    return [hits.length === 0 && !usesSnacksFrecency, usesSnacksFrecency ? "ranking still reads snacks frecency (SQLite)" : hits.map(rel).join(", ") || "none"];
  },
  "no-live-preview": () => {
    // ISC-170: live-preview.nvim served any readable file over HTTP. Nothing may name it: the
    // lockfile, any Lua file, or any keymap or key hint the started editor defines.
    const re = /live[-_ ]?preview/i;
    const hits = [...notInLock(re).map((k) => `nvim-pack-lock.json: ${k}`)];
    if (re.test(read(join(ROOT, "nvim-pack-lock.json")))) hits.push("nvim-pack-lock.json text");
    hits.push(...grep(re, files().filter((p) => p.endsWith(".lua"))).map(rel));
    const lua = `local out = {}
for _, m in ipairs({ "n", "i", "x", "s", "o", "t", "c" }) do
  for _, k in ipairs(vim.api.nvim_get_keymap(m)) do table.insert(out, m .. " " .. k.lhs .. " " .. (k.rhs or "") .. " " .. (k.desc or "")) end
end
for _, c in ipairs(MiniClue and MiniClue.config.clues or {}) do
  if type(c) == "table" and c.desc then table.insert(out, "clue " .. tostring(c.keys) .. " " .. c.desc) end
end
table.insert(out, "cmd LivePreview=" .. vim.fn.exists(":LivePreview"))
io.stdout:write(vim.json.encode(out)) vim.cmd("qa!")`;
    const p = Bun.spawnSync(["nvim", "--headless", "-i", "NONE", `+lua vim.defer_fn(function() ${lua.replace(/\n/g, " ")} end, 300)`], {
      cwd: ROOT, env: { ...process.env, NVIM_APPNAME: process.env.NVIM_APPNAME ?? "ulvim" },
    });
    let maps: string[];
    try { maps = JSON.parse(p.stdout.toString()); } catch { return [false, `could not read keymaps: ${p.stderr.toString().slice(0, 200)}`]; }
    const cmd = maps.pop();
    if (cmd !== "cmd LivePreview=0") hits.push(cmd ?? "no command probe");
    hits.push(...maps.filter((m) => re.test(m)));
    return [hits.length === 0, hits.length ? hits.join(", ") : `none in the lockfile, ${files().filter((p) => p.endsWith(".lua")).length} Lua files or ${maps.length} keymaps and hints`];
  },
  "no-lazygit-plugin": () => { const h = notInLock(/lazygit/i); return [h.length === 0, h.join(", ") || "none"]; },
  "no-noice": () => { const h = notInLock(/noice|nui\.nvim/i); return [h.length === 0, h.join(", ") || "none"]; },
  "no-which-key": () => { const h = notInLock(/which-key/i); return [h.length === 0, h.join(", ") || "none"]; },
  "no-flash": () => { const h = notInLock(/flash/i); return [h.length === 0, h.join(", ") || "none"]; },
};

const [name, arg] = process.argv.slice(2);
const fn = checks[name];
if (!fn) { console.log(`FAIL unknown check ${name}`); process.exit(2); }
const [ok, detail] = fn(arg);
console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`);
process.exit(ok ? 0 : 1);
