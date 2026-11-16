// F13, pure Neovim: the nvim you run is the upstream release pinned in neovim.json.
//   bun tests/neovim_pin.ts <path|arch|tamper>
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const pin = await Bun.file(join(ROOT, "neovim.json")).json() as { version: string };
const OPT = join(homedir(), ".local/opt/neovim");
const sh = (cmd: string) => Bun.spawnSync(["zsh", "-ic", cmd], { stdout: "pipe", stderr: "pipe" }).stdout.toString().trim();

const checks: Record<string, () => [boolean, string]> = {
  // ISC-143: what an interactive shell runs for `nvim` and `v`, by real path and version.
  path: () => {
    const first = sh("command -v nvim");
    const alias = sh("alias v");
    const real = first && existsSync(first) ? realpathSync(first) : "";
    const dir = join(OPT, `v${pin.version}`);
    if (!existsSync(dir)) return [false, `pinned v${pin.version} not installed (bun scripts/nvim-install.ts)`];
    const want = realpathSync(dir) + "/bin/nvim";
    const ver = real ? Bun.spawnSync([real, "--version"]).stdout.toString().match(/^NVIM v(\S+)/)?.[1] : undefined;
    const ok = real === want && ver === pin.version && /^v='?nvim'?$/.test(alias);
    return [ok, `nvim -> ${real || "missing"} (v${ver}); want ${want} (v${pin.version}); ${alias}`];
  },
  // One pin per CPU: x64 resolves to the Intel tarball (its bytes are checked against the x64 digest),
  // and a CPU the pin lacks is refused before any download.
  arch: () => {
    const p = pin as unknown as { assets?: Record<string, { asset: string; sha256: string }> };
    const both = ["arm64", "x64"].every((k) => /^nvim-macos-[a-z0-9_]+\.tar\.gz$/.test(p.assets?.[k]?.asset ?? "") && /^[0-9a-f]{64}$/.test(p.assets?.[k]?.sha256 ?? ""));
    const dir = mkdtempSync(join(tmpdir(), "ulvim-arch-"));
    try {
      const bad = join(dir, "x.tar.gz");
      writeFileSync(bad, "not the release");
      const run = (arch: string, args: string[]) => {
        const env = { ...process.env, ULVIM_NVIM_ARCH: arch, ULVIM_NVIM_OPT: join(dir, "opt"), ULVIM_NVIM_BIN: join(dir, "bin") };
        const r = Bun.spawnSync([process.execPath, "scripts/nvim-install.ts", ...args], { cwd: ROOT, env, stdout: "pipe" });
        return { code: r.exitCode, j: JSON.parse(r.stdout.toString() || "{}") };
      };
      const x = run("x64", ["--file", bad]);
      const u = run("ppc", []);
      const ok = both && x.code === 1 && x.j.asset === "nvim-macos-x86_64.tar.gz" && x.j.want === p.assets?.x64?.sha256 && u.code === 1 && /no tarball for this CPU \(ppc\)/.test(u.j.error ?? "");
      return [ok, `both pinned ${both}; x64 -> ${x.j.asset} (${x.j.refused}); ppc -> ${u.j.error}`];
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  // ISC-144: wrong bytes are refused before anything is unpacked or linked.
  tamper: () => {
    const dir = mkdtempSync(join(tmpdir(), "ulvim-pin-"));
    try {
      const bad = join(dir, "nvim-macos-arm64.tar.gz");
      writeFileSync(bad, "not the release");
      const env = { ...process.env, ULVIM_NVIM_OPT: join(dir, "opt"), ULVIM_NVIM_BIN: join(dir, "bin") };
      const p = Bun.spawnSync([process.execPath, "scripts/nvim-install.ts", "--file", bad], { cwd: ROOT, env, stdout: "pipe" });
      const res = JSON.parse(p.stdout.toString() || "{}");
      const installed = existsSync(join(dir, "opt")) && readdirSync(join(dir, "opt")).some((n) => n.startsWith("v"));
      const linked = existsSync(join(dir, "bin/nvim"));
      return [p.exitCode === 1 && res.refused === "sha256 mismatch" && !installed && !linked, `exit ${p.exitCode}, ${res.refused ?? res.error}, installed ${installed}, linked ${linked}`];
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};

const name = process.argv[2];
const check = checks[name ?? ""];
if (!check) { console.log(`usage: neovim_pin.ts <${Object.keys(checks).join("|")}>`); process.exit(2); }
const [ok, detail] = check();
console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`);
process.exit(ok ? 0 : 1);
