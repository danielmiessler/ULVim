// Captures what Neovim draws for ULVim into PNGs (the README screenshots), never a mockup.
//   bun tests/capture.ts [--out assets/screenshots] [--keep]   writes dashboard, editing, cmdline, keys and editing-phone
// It builds a throwaway home holding only synthetic notes and the public config (no lua/user/,
// no search-roots.local.json), starts `nvim --embed` there, attaches as a UI over msgpack-rpc
// (ext_linegrid), feeds keys, records the grid with its highlight attributes, renders each grid to
// HTML in the colors Neovim sent, and screenshots it at 2x in headless Chrome with its own profile.
// Plugins and parsers are copied from this machine's NVIM_APPNAME=ulvim data when present, so
// nothing is downloaded; without them vim.pack installs from the lockfile on first start.
// Needs: nvim, git, bun, Google Chrome in /Applications. Removes the throwaway home when done.
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = realpathSync(join(import.meta.dir, ".."));
const argv = process.argv.slice(2);
const OUT = resolve(ROOT, argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : "assets/screenshots");
const KEEP = argv.includes("--keep");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// The start screen is captured 84 x 38 (its art and menu are 60 columns wide); the editing shots
// are 104 columns, cut to the note's own height.
// The phone shot is the editing shot at 60 columns, so its text stays legible on a narrow screen.
const DASH_COLS = 84, ROWS = 38, COLS = 104, PHONE_COLS = 60;
// Room around the window for its shadow (0 12px 28px): the PNG is transparent outside the window,
// so the shadow must fade out inside this margin, or the image edge cuts it and it shows as a grey
// box on a light page. More below than above, because the shadow falls downward.
const M = { top: 24, side: 36, bottom: 48 };

// ---- msgpack (the subset Neovim's RPC uses) ------------------------------------------------
class Incomplete extends Error {}
function encode(v: unknown, out: number[] = []): number[] {
  const u8 = (n: number) => out.push(n & 0xff);
  const be = (n: number, bytes: number) => { for (let i = bytes - 1; i >= 0; i--) u8(Math.floor(n / 2 ** (8 * i))); };
  if (v === null || v === undefined) u8(0xc0);
  else if (v === true) u8(0xc3);
  else if (v === false) u8(0xc2);
  else if (typeof v === "number" && Number.isInteger(v)) {
    if (v >= 0 && v < 128) u8(v);
    else if (v < 0 && v >= -32) u8(0xe0 | (v + 32));
    else if (v >= 0 && v < 2 ** 32) { u8(0xce); be(v, 4); }
    else { u8(0xd3); const b = new DataView(new ArrayBuffer(8)); b.setBigInt64(0, BigInt(v)); for (let i = 0; i < 8; i++) u8(b.getUint8(i)); }
  } else if (typeof v === "number") { u8(0xcb); const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, v); for (let i = 0; i < 8; i++) u8(b.getUint8(i)); }
  else if (typeof v === "string") {
    const s = new TextEncoder().encode(v);
    if (s.length < 32) u8(0xa0 | s.length); else { u8(0xdb); be(s.length, 4); }
    for (const b of s) u8(b);
  } else if (Array.isArray(v)) {
    if (v.length < 16) u8(0x90 | v.length); else { u8(0xdd); be(v.length, 4); }
    for (const x of v) encode(x, out);
  } else if (typeof v === "object") {
    const e = Object.entries(v as Record<string, unknown>);
    if (e.length < 16) u8(0x80 | e.length); else { u8(0xdf); be(e.length, 4); }
    for (const [k, x] of e) { encode(k, out); encode(x, out); }
  }
  return out;
}
function decode(buf: Uint8Array, start: number): [unknown, number] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = start;
  const need = (n: number) => { if (p + n > buf.length) throw new Incomplete(); };
  const str = (n: number) => { need(n); const s = new TextDecoder().decode(buf.subarray(p, p + n)); p += n; return s; };
  const arr = (n: number) => { const a: unknown[] = []; for (let i = 0; i < n; i++) { const [x, q] = decode(buf, p); a.push(x); p = q; } return a; };
  const map = (n: number) => { const m: Record<string, unknown> = {}; for (let i = 0; i < n; i++) { const [k, q] = decode(buf, p); p = q; const [x, r] = decode(buf, p); p = r; m[String(k)] = x; } return m; };
  const ext = (n: number) => { need(1 + n); const type = dv.getInt8(p); p += 1; const [data] = n ? decode(buf.subarray(0, p + n), p) : [null]; p += n; return { ext: type, data }; };
  need(1);
  const b = buf[p++];
  if (b < 0x80) return [b, p];
  if (b >= 0xe0) return [b - 256, p];
  if ((b & 0xf0) === 0x80) return [map(b & 0x0f), p];
  if ((b & 0xf0) === 0x90) return [arr(b & 0x0f), p];
  if ((b & 0xe0) === 0xa0) return [str(b & 0x1f), p];
  const u = (n: number) => { need(n); let x = 0; for (let i = 0; i < n; i++) x = x * 256 + buf[p + i]; p += n; return x; };
  switch (b) {
    case 0xc0: return [null, p];
    case 0xc2: return [false, p];
    case 0xc3: return [true, p];
    case 0xc4: { const n = u(1); need(n); p += n; return [buf.slice(p - n, p), p]; }
    case 0xc5: { const n = u(2); need(n); p += n; return [buf.slice(p - n, p), p]; }
    case 0xc6: { const n = u(4); need(n); p += n; return [buf.slice(p - n, p), p]; }
    case 0xca: need(4); p += 4; return [dv.getFloat32(p - 4), p];
    case 0xcb: need(8); p += 8; return [dv.getFloat64(p - 8), p];
    case 0xcc: return [u(1), p];
    case 0xcd: return [u(2), p];
    case 0xce: return [u(4), p];
    case 0xcf: need(8); p += 8; return [Number(dv.getBigUint64(p - 8)), p];
    case 0xd0: need(1); p += 1; return [dv.getInt8(p - 1), p];
    case 0xd1: need(2); p += 2; return [dv.getInt16(p - 2), p];
    case 0xd2: need(4); p += 4; return [dv.getInt32(p - 4), p];
    case 0xd3: need(8); p += 8; return [Number(dv.getBigInt64(p - 8)), p];
    case 0xd4: return [ext(1), p];
    case 0xd5: return [ext(2), p];
    case 0xd6: return [ext(4), p];
    case 0xd7: return [ext(8), p];
    case 0xd8: return [ext(16), p];
    case 0xc7: return [ext(u(1)), p];
    case 0xc8: return [ext(u(2)), p];
    case 0xc9: return [ext(u(4)), p];
    case 0xd9: return [str(u(1)), p];
    case 0xda: return [str(u(2)), p];
    case 0xdb: return [str(u(4)), p];
    case 0xdc: return [arr(u(2)), p];
    case 0xdd: return [arr(u(4)), p];
    case 0xde: return [map(u(2)), p];
    case 0xdf: return [map(u(4)), p];
  }
  throw new Error(`msgpack: unknown byte 0x${b.toString(16)}`);
}

// ---- the grid Neovim draws -----------------------------------------------------------------
type Attr = { foreground?: number; background?: number; special?: number; reverse?: boolean; bold?: boolean; italic?: boolean; underline?: boolean; undercurl?: boolean; strikethrough?: boolean };
type Cell = { t: string; hl: number };
const state = {
  cells: [] as Cell[][], attrs: new Map<number, Attr>(), fg: 0xc0caf5, bg: -1, cursor: [0, 0], title: "",
  modes: [] as { cursor_shape?: string; cell_percentage?: number; attr_id?: number }[], mode: 0, flushes: 0, lastFlush: 0,
};
function resize(w: number, h: number) { state.cells = Array.from({ length: h }, () => Array.from({ length: w }, () => ({ t: " ", hl: 0 }))); }
function redraw(events: unknown[][]) {
  for (const [name, ...calls] of events as [string, ...unknown[][]][]) {
    for (const a of calls) {
      switch (name) {
        case "grid_resize": resize(a[1] as number, a[2] as number); break;
        case "default_colors_set": state.fg = a[0] as number; state.bg = a[1] as number; break;
        case "hl_attr_define": state.attrs.set(a[0] as number, a[1] as Attr); break;
        case "grid_clear": for (const r of state.cells) for (const c of r) { c.t = " "; c.hl = 0; } break;
        case "grid_cursor_goto": state.cursor = [a[1] as number, a[2] as number]; break;
        case "set_title": state.title = a[0] as string; break;
        case "mode_info_set": state.modes = a[1] as typeof state.modes; break;
        case "mode_change": state.mode = a[1] as number; break;
        case "flush": state.flushes++; state.lastFlush = Date.now(); break;
        case "grid_line": {
          const row = a[1] as number; let col = a[2] as number; let hl = 0;
          for (const cell of a[3] as unknown[][]) {
            const text = cell[0] as string;
            if (cell.length > 1) hl = cell[1] as number;
            const rep = cell.length > 2 ? (cell[2] as number) : 1;
            for (let i = 0; i < rep; i++) { const c = state.cells[row]?.[col++]; if (c) { c.t = text; c.hl = hl; } }
          }
          break;
        }
        case "grid_scroll": {
          const [, top, bot, left, right, rows] = a as number[];
          const copy = (r: number, from: number) => { for (let c = left; c < right; c++) state.cells[r][c] = { ...state.cells[from][c] }; };
          if (rows > 0) for (let r = top; r < bot - rows; r++) copy(r, r + rows);
          else for (let r = bot - 1; r >= top - rows; r--) copy(r, r + rows);
          break;
        }
      }
    }
  }
}

// ---- RPC -----------------------------------------------------------------------------------
let proc: ReturnType<typeof Bun.spawn<"pipe", "pipe", "pipe">>;
let pending = new Uint8Array(0);
let msgid = 0;
const waiters = new Map<number, (r: [unknown, unknown]) => void>();
function request(method: string, params: unknown[]): Promise<unknown> {
  const id = ++msgid;
  proc.stdin.write(new Uint8Array(encode([0, id, method, params])));
  proc.stdin.flush();
  return new Promise((res, rej) => waiters.set(id, ([err, r]) => (err ? rej(new Error(`${method}: ${JSON.stringify(err)}`)) : res(r))));
}
async function pump() {
  for await (const chunk of proc.stdout) {
    const merged = new Uint8Array(pending.length + chunk.length);
    merged.set(pending); merged.set(chunk, pending.length);
    let p = 0;
    while (p < merged.length) {
      let msg: unknown, q: number;
      try { [msg, q] = decode(merged, p); } catch (e) { if (e instanceof Incomplete) break; throw e; }
      p = q;
      const m = msg as unknown[];
      if (m[0] === 1) waiters.get(m[1] as number)?.([m[2], m[3]]);
      else if (m[0] === 2 && m[1] === "redraw") redraw(m[2] as unknown[][]);
      else if (m[0] === 0) proc.stdin.write(new Uint8Array(encode([1, m[1], "not supported", null]))); // requests to the UI
    }
    pending = merged.slice(p);
  }
}
// Waits until Neovim has drawn something new since `since` and then stayed quiet for `quiet` ms.
async function settle(since: number, quiet = 1200, max = 15000) {
  const start = Date.now();
  while (Date.now() - start < max) {
    await Bun.sleep(100);
    if (state.flushes > since && Date.now() - state.lastFlush > quiet) return;
  }
}
// Sends keys the way a person types them, then waits for the screen to settle.
async function type(keys: string, quiet = 1200) {
  const before = state.flushes;
  await request("nvim_input", [keys]);
  await settle(before, quiet);
}

// ---- render to HTML ------------------------------------------------------------------------
const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const TERM_BG = 0x24283b; // the terminal background behind ULVim's transparent tokyonight storm
let transparent = true; // set from Neovim's Normal group once attached
const CW = 8.4, CH = 19, FONT = 14; // cell size in CSS px
function snapshot() {
  return { cells: state.cells.map((r) => r.map((c) => ({ ...c }))), attrs: new Map(state.attrs), fg: state.fg, bg: state.bg, cursor: [...state.cursor], title: state.title, shape: state.modes[state.mode] ?? {} };
}
function html(s: ReturnType<typeof snapshot>, opts: { cursor: boolean }) {
  // ULVim's Normal has no background (transparent), so the terminal's own background shows.
  const dbg = transparent || s.bg < 0 ? TERM_BG : s.bg;
  const W = s.cells[0].length * CW, H = s.cells.length * CH;
  const bgs: string[] = [], text: string[] = [];
  s.cells.forEach((row, r) => {
    let runStart = 0, runBg = -2;
    const flush = (end: number) => { if (runBg >= 0 && runBg !== dbg) bgs.push(`<i style="left:${runStart * CW}px;top:${r * CH}px;width:${(end - runStart) * CW}px;background:${hex(runBg)}"></i>`); };
    row.forEach((c, col) => {
      const a = s.attrs.get(c.hl) ?? {};
      let fg = a.foreground ?? s.fg, bg = a.background ?? dbg;
      if (a.reverse) [fg, bg] = [bg, fg];
      if (bg !== runBg) { flush(col); runStart = col; runBg = bg; }
      if (c.t !== " " && c.t !== "") {
        const st = [`left:${col * CW}px`, `top:${r * CH}px`, `color:${hex(fg)}`];
        if (a.bold) st.push("font-weight:700");
        if (a.italic) st.push("font-style:italic");
        const deco = [a.underline || a.undercurl ? "underline" : "", a.strikethrough ? "line-through" : ""].filter(Boolean).join(" ");
        if (deco) st.push(`text-decoration:${deco}`, `text-decoration-color:${hex(a.special ?? fg)}`);
        text.push(`<b style="${st.join(";")}">${esc(c.t)}</b>`);
      }
    });
    flush(row.length);
  });
  let cursor = "";
  if (opts.cursor) {
    const [r, c] = s.cursor;
    const shape = s.shape.cursor_shape ?? "block", pct = (s.shape.cell_percentage ?? 100) / 100;
    const w = shape === "vertical" ? Math.max(2, CW * pct * 0.25) : CW, h = shape === "horizontal" ? CH * pct : CH;
    const cell = s.cells[r]?.[c];
    const under = shape === "block" && cell && cell.t.trim() ? `<b style="left:0;top:0;color:${hex(dbg)}">${esc(cell.t)}</b>` : "";
    cursor = `<div class="cur" style="left:${c * CW}px;top:${r * CH + CH - h}px;width:${w}px;height:${h}px">${under}</div>`;
  }
  const title = esc(s.title || "nvim");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:transparent}
  .frame{margin:${M.top}px ${M.side}px ${M.bottom}px;display:inline-block;border-radius:12px;overflow:hidden;background:${hex(dbg)};
    box-shadow:0 12px 28px rgba(0,0,0,.28),0 2px 6px rgba(0,0,0,.18),0 0 0 1px rgba(255,255,255,.08)}
  .bar{height:34px;display:flex;align-items:center;gap:8px;padding:0 14px;background:#1f2335;position:relative;
    font:500 12.5px -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:#a9b1d6}
  .bar span{width:12px;height:12px;border-radius:50%;display:inline-block}
  .bar .t{position:absolute;left:0;right:0;text-align:center;pointer-events:none}
  .grid{position:relative;width:${W}px;height:${H}px;margin:10px 12px 12px;
    font:${FONT}px/${CH}px "SF Mono",Menlo,"Symbols Nerd Font Mono",monospace;font-variant-ligatures:none}
  .grid i,.grid b{position:absolute;display:block;height:${CH}px;font-weight:400;white-space:pre}
  .grid b{width:${CW}px;text-align:left;overflow:visible}
  .cur{position:absolute;background:#c0caf5}
  </style></head><body><div class="frame"><div class="bar"><span style="background:#ff5f57"></span><span style="background:#febc2e"></span><span style="background:#28c840"></span><div class="t">${title}</div></div>
  <div class="grid">${bgs.join("")}${text.join("")}${cursor}</div></div></body></html>`;
}
async function shoot(page: string, png: string, w: number, h: number, profile: string) {
  // --no-sandbox: Chrome's own sandbox cannot start inside a sandboxed shell; the page is local and
  // generated here, with no remote content.
  const p = Bun.spawn([CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${profile}`,
    "--force-device-scale-factor=2", "--default-background-color=00000000", `--window-size=${Math.ceil(w)},${Math.ceil(h)}`,
    `--screenshot=${png}`, "file://" + page], { stdout: "ignore", stderr: "ignore" });
  const timer = setTimeout(() => p.kill(), 60_000);
  await p.exited;
  clearTimeout(timer);
  if (!existsSync(png)) throw new Error(`chrome wrote no ${png}`);
}

// ---- a throwaway home with synthetic content -------------------------------------------------
const NOTE = `# The workhorse

Notes for an essay on tools that last. The first draft was rough; this draft ships.

## What a workhorse does

- Opens before you finish reaching for it.
- Hides the **markup** until the cursor reaches it, so the *words* stay in front.
- Keeps every change: undo survives a restart.
- Saves on its own, but never over a newer copy on disk.

## Three rules

1. Start fast.
2. Stay out of the way.
3. Never need a weekend of upkeep.

> The best tool is the one you stop noticing.

A long paragraph shows the soft wrap: lines break at the edge of the window on a word boundary, and \`j\` and \`k\` move by screen line, so a paragraph written as one line reads and moves like a page. See [the outline](outline.md) for the rest of the draft.
`;
const FILES: Record<string, string> = {
  "notes/workhorse.md": NOTE,
  "notes/outline.md": "# Outline\n\n1. The problem\n2. The draft\n3. The check\n",
  "notes/reading-list.md": "# Reading list\n\n- [ ] On writing well\n- [ ] The elements of style\n",
  "notes/todo.md": "# Today\n\n- [x] Rough draft\n- [ ] Second draft\n- [ ] Read it aloud\n",
  "notes/ideas.md": "# Ideas\n\n- A tool you stop noticing\n",
  "code/site/index.html": "<!doctype html>\n<title>Site</title>\n<h1>Hello</h1>\n",
};

function seedHome(home: string) {
  const cfg = join(home, ".config/ulvim");
  mkdirSync(cfg, { recursive: true });
  // The public distribution only: no personal layer.
  for (const p of ["init.lua", "lua/ulvim", "scripts", "search-roots.json", "nvim-pack-lock.json", "neovim.json"])
    cpSync(join(ROOT, p), join(cfg, p), { recursive: true });
  for (const [rel, text] of Object.entries(FILES)) { mkdirSync(join(home, rel, ".."), { recursive: true }); writeFileSync(join(home, rel), text); }
  // Plugins and parsers from this machine's ulvim data, if present (no downloads).
  const src = join(homedir(), ".local/share/ulvim/site");
  const dst = join(home, ".local/share/ulvim/site");
  if (existsSync(src)) {
    for (const d of ["pack", "parser", "parser-info"]) if (existsSync(join(src, d))) cpSync(join(src, d), join(dst, d), { recursive: true });
    const q = join(src, "queries");
    if (existsSync(q)) {
      mkdirSync(join(dst, "queries"), { recursive: true });
      for (const name of readdirSync(q)) {
        const from = join(q, name);
        if (lstatSync(from).isSymbolicLink()) symlinkSync(readlinkSync(from).replace(src, dst), join(dst, "queries", name));
        else cpSync(from, join(dst, "queries", name), { recursive: true });
      }
    }
  }
}
function env(home: string) {
  const e: Record<string, string> = { HOME: home, NVIM_APPNAME: "ulvim", PATH: process.env.PATH ?? "", TERM: "xterm-256color", LANG: "en_US.UTF-8",
    GIT_AUTHOR_NAME: "ULVim", GIT_AUTHOR_EMAIL: "ulvim@example.com", GIT_COMMITTER_NAME: "ULVim", GIT_COMMITTER_EMAIL: "ulvim@example.com" };
  return e;
}

// ---- run ---------------------------------------------------------------------------------
const work = realpathSync(mkdtempSync(join(tmpdir(), "ulvim-capture-")));
const home = join(work, "home");
try {
  seedHome(home);
  const e = env(home);
  const notes = join(home, "notes");
  for (const cmd of [["git", "init", "-q", "-b", "main"], ["git", "add", "."], ["git", "commit", "-q", "-m", "notes"]])
    Bun.spawnSync(cmd, { cwd: notes, env: e });
  // First start: plugins settle, and opening the notes gives the start screen its recent files.
  const order = ["code/site/index.html", "notes/ideas.md", "notes/reading-list.md", "notes/todo.md", "notes/outline.md", "notes/workhorse.md"];
  const warm = Bun.spawnSync(["nvim", "--headless", ...order.flatMap((f) => ["-c", `edit ${join(home, f)}`]), "-c", "wshada!", "-c", "qa!"], { cwd: notes, env: e, timeout: 120_000 });
  // A start that prints anything (an error, a long-path failure in vim.loader) would draw a pager, not the editor.
  if (warm.exitCode !== 0 || warm.stderr.length) throw new Error("warm-up start failed: " + warm.stderr.toString().slice(0, 400));

  proc = Bun.spawn(["nvim", "--embed"], { cwd: notes, env: e, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  const pumping = pump();
  await request("nvim_ui_attach", [DASH_COLS, ROWS, { rgb: true, ext_linegrid: true }]);
  await settle(0, 2000);
  const normal = (await request("nvim_get_hl", [0, { name: "Normal" }])) as { bg?: number };
  transparent = normal.bg === undefined;
  const shots: [string, ReturnType<typeof snapshot>, boolean][] = [];
  // 1. The start screen.
  shots.push(["dashboard", snapshot(), false]);

  // 2. A markdown buffer among others: tabline, statusline, hidden markup, soft wrap.
  let before = state.flushes;
  await request("nvim_ui_try_resize", [COLS, ROWS]); // full width first: the wrap, and so the height, depend on it
  for (const f of ["outline.md", "todo.md", "workhorse.md"]) await request("nvim_command", [`edit ${f}`]);
  await settle(before);
  // Cut the screen to the note: its wrapped height, the tabline and the statusline, and one spare
  // row, so no empty band sits under the text.
  const height = (await request("nvim_win_text_height", [0, {}])) as { all: number };
  before = state.flushes;
  await request("nvim_ui_try_resize", [COLS, height.all + 3]);
  await settle(before);
  await type("12G0w");
  shots.push(["editing", snapshot(), true]);
  // 3. The floating command line, mid-way through a substitute (inccommand previews it in the buffer).
  await type(":%s/draft/revision/g", 1500);
  shots.push(["cmdline", snapshot(), true]);
  await type("<Esc>");
  // 4. The leader key hints.
  await type("<Space>", 1500);
  shots.push(["keys", snapshot(), false]);
  await type("<Esc>");
  // 5. The editing shot again at phone width: the note re-wraps, so its height is measured again.
  before = state.flushes;
  await request("nvim_ui_try_resize", [PHONE_COLS, ROWS]);
  await settle(before);
  const phone = (await request("nvim_win_text_height", [0, {}])) as { all: number };
  before = state.flushes;
  await request("nvim_ui_try_resize", [PHONE_COLS, phone.all + 3]);
  await settle(before);
  await type("gg12G0w");
  shots.push(["editing-phone", snapshot(), true]);

  mkdirSync(OUT, { recursive: true });
  const profile = join(work, "chrome");
  for (const [name, s, cur] of shots) {
    const page = join(work, `${name}.html`);
    writeFileSync(page, html(s, { cursor: cur }));
    const w = s.cells[0].length * CW + 24 + 2 * M.side, h = s.cells.length * CH + 34 + 22 + M.top + M.bottom;
    await shoot(page, join(OUT, `${name}.png`), w, h, profile);
    if (KEEP) writeFileSync(join(work, `${name}.grid.txt`), s.cells.map((r) => r.map((c) => c.t || "").join("")).join("\n") + "\n");
    console.log(`wrote ${join(OUT, name + ".png")}`);
  }
  request("nvim_command", ["qa!"]).catch(() => {});
  const t = setTimeout(() => proc.kill(), 3000);
  await proc.exited;
  clearTimeout(t);
  await pumping.catch(() => {});
} finally {
  try { proc?.kill(); } catch { /* already gone */ }
  if (KEEP) console.log(`kept ${work}`); else rmSync(work, { recursive: true, force: true });
}
