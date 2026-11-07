// Installs the upstream Neovim release pinned in neovim.json (ISC-143, ISC-144).
//   bun scripts/nvim-install.ts            install the pin (no-op when it is already current)
//   bun scripts/nvim-install.ts --check    pin, installed and latest upstream versions; changes nothing
//   bun scripts/nvim-install.ts --latest   move the pin to the latest stable release, then install it
//   bun scripts/nvim-install.ts --file <tarball>   install the pin from a local copy (still checksum-verified)
// Layout: ~/.local/opt/neovim/v<version>/ (one folder per release), ~/.local/opt/neovim/current -> that
// folder, ~/.local/bin/nvim -> current/bin/nvim. Rolling back is pointing `current` at an older folder.
// Prints one JSON line. Exit 0 ok, 1 refused or failed, 2 usage.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

class InvariantViolation extends Error {}
function invariant(cond: unknown, msg: string): asserts cond { if (!cond) throw new InvariantViolation(msg); }

type Pin = { version: string; asset: string; sha256: string; source: string };
const ROOT = join(import.meta.dir, "..");
const PIN_FILE = join(ROOT, "neovim.json");
// The release asset names a file inside OPT and the download URL, so it is one plain file name:
// nvim-<os>-<arch>.tar.gz, no slashes, no dot segments.
const ASSET = /^nvim-[a-z0-9]+(?:-[a-z0-9_]+)*\.tar\.gz$/;
const OPT = process.env.ULVIM_NVIM_OPT ?? join(homedir(), ".local/opt/neovim");
const BIN = process.env.ULVIM_NVIM_BIN ?? join(homedir(), ".local/bin");
const API = "https://api.github.com/repos/neovim/neovim/releases";

const out = (o: object, code = 0): never => { console.log(JSON.stringify(o)); process.exit(code); };
const readPin = (): Pin => JSON.parse(readFileSync(PIN_FILE, "utf8"));
const versionOf = (nvim: string) => {
  if (!existsSync(nvim)) return null;
  const p = Bun.spawnSync([nvim, "--version"]);
  return p.stdout.toString().match(/^NVIM v(\S+)/)?.[1] ?? null;
};
async function latest(): Promise<Pin> {
  const r = await fetch(`${API}/latest`, { headers: { Accept: "application/vnd.github+json" } });
  invariant(r.ok, `GitHub latest release: HTTP ${r.status}`);
  const j = await r.json() as { tag_name: string; prerelease: boolean; html_url: string; assets: { name: string; digest?: string }[] };
  invariant(!j.prerelease && /^v\d+\.\d+\.\d+$/.test(j.tag_name), `not a stable release: ${j.tag_name}`);
  const asset = readPin().asset;
  invariant(typeof asset === "string" && ASSET.test(asset), `neovim.json asset is not a release tarball name: ${JSON.stringify(asset)}`);
  const a = j.assets.find((x) => x.name === asset);
  const digest = a?.digest;
  invariant(digest?.startsWith("sha256:"), `release ${j.tag_name} has no sha256 digest for ${asset}`);
  return { version: j.tag_name.slice(1), asset, sha256: digest.slice(7), source: j.html_url };
}
const sha256 = (buf: Uint8Array) => createHash("sha256").update(buf).digest("hex");

function swapLink(link: string, target: string) {
  mkdirSync(dirname(link), { recursive: true });
  const tmp = `${link}.new-${process.pid}`;
  rmSync(tmp, { force: true });
  symlinkSync(target, tmp);
  renameSync(tmp, link); // atomic replace: nvim is never missing mid-switch
}

async function install(pin: Pin, file?: string) {
  invariant(/^\d+\.\d+\.\d+$/.test(pin.version) && /^[0-9a-f]{64}$/.test(pin.sha256), "neovim.json is malformed");
  invariant(typeof pin.asset === "string" && ASSET.test(pin.asset), `neovim.json asset is not a release tarball name: ${JSON.stringify(pin.asset)}`);
  const dest = join(OPT, `v${pin.version}`);
  const nvimBin = join(BIN, "nvim");
  if (!file && versionOf(join(dest, "bin/nvim")) === pin.version && existsSync(nvimBin) && versionOf(nvimBin) === pin.version)
    return out({ ok: true, changed: false, version: pin.version, path: dest });
  let bytes: Uint8Array;
  if (file) bytes = new Uint8Array(readFileSync(file));
  else {
    const url = `https://github.com/neovim/neovim/releases/download/v${pin.version}/${pin.asset}`;
    const r = await fetch(url);
    invariant(r.ok, `download ${url}: HTTP ${r.status}`);
    bytes = new Uint8Array(await r.arrayBuffer());
  }
  const got = sha256(bytes);
  if (got !== pin.sha256) return out({ ok: false, refused: "sha256 mismatch", want: pin.sha256, got }, 1);
  mkdirSync(OPT, { recursive: true });
  const work = mkdtempSync(join(OPT, ".install-"));
  try {
    writeFileSync(join(work, pin.asset), bytes);
    const x = Bun.spawnSync(["tar", "-xzf", join(work, pin.asset), "-C", work]);
    invariant(x.exitCode === 0, "tar failed: " + x.stderr.toString());
    const unpacked = join(work, pin.asset.replace(/\.tar\.gz$/, ""));
    invariant(versionOf(join(unpacked, "bin/nvim")) === pin.version, `tarball nvim is not v${pin.version}`);
    rmSync(dest, { recursive: true, force: true });
    renameSync(unpacked, dest);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  invariant(versionOf(join(dest, "bin/nvim")) === pin.version, "installed nvim does not run");
  swapLink(join(OPT, "current"), dest);
  swapLink(nvimBin, join(OPT, "current/bin/nvim"));
  invariant(versionOf(nvimBin) === pin.version, `${nvimBin} is not v${pin.version} after install`);
  out({ ok: true, changed: true, version: pin.version, path: dest });
}

const args = process.argv.slice(2);
try {
  if (args[0] === "--check") {
    const pin = readPin();
    const current = existsSync(join(OPT, "current")) && lstatSync(join(OPT, "current")).isSymbolicLink() ? readlinkSync(join(OPT, "current")) : null;
    const up = await latest().catch((e) => ({ version: null, error: String(e.message ?? e) }));
    out({ ok: true, pin: pin.version, installed: versionOf(join(BIN, "nvim")), current, latest: up.version, update_available: !!up.version && up.version !== pin.version });
  } else if (args[0] === "--latest") {
    const pin = await latest();
    writeFileSync(PIN_FILE, JSON.stringify(pin, null, 2) + "\n");
    await install(pin);
  } else if (args[0] === "--file") {
    if (!args[1]) out({ ok: false, error: "usage: --file <tarball>" }, 2);
    await install(readPin(), args[1]);
  } else if (args.length === 0) {
    await install(readPin());
  } else out({ ok: false, error: "usage: [--check | --latest | --file <tarball>]" }, 2);
} catch (e) {
  out({ ok: false, error: String((e as Error).message ?? e) }, 1);
}
