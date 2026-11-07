// ISC-2: median time to "NVIM STARTED" over N headless runs is at most --max ms.
//   bun tests/startup.ts --runs 5 --max 303
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (k: string, d: number) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const runs = arg("--runs", 5), max = arg("--max", 303);
const dir = mkdtempSync(join(tmpdir(), "ulvim-startup-"));
function measure(): number[] {
const times: number[] = [];
for (let i = 0; i < runs; i++) {
  const f = join(dir, `${i}.log`);
  Bun.spawnSync(["nvim", "--headless", "--startuptime", f, "+qa"], { env: { ...process.env, NVIM_APPNAME: "ulvim" } });
  const line = readFileSync(f, "utf8").split("\n").find((l) => l.includes("NVIM STARTED"));
  if (line) times.push(Number(line.trim().split(/\s+/)[0]));
}
return times.sort((a, b) => a - b);
}
const median_ = (t: number[]) => t[Math.floor(t.length / 2)];
// A loaded machine (another job compiling, say) can slow every run for a few seconds, so a
// slow median is measured once more after a pause; a real regression is slow both times.
let times = measure();
let retried = "";
if (!(median_(times) <= max)) {
  retried = ` (first median ${median_(times)?.toFixed(1)} ms, remeasured after 30 s)`;
  Bun.sleepSync(30_000);
  times = measure();
}
const median = median_(times);
const ok = times.length === runs && median <= max;
console.log(`${ok ? "PASS" : "FAIL"} startup median ${median?.toFixed(1)} ms over ${times.length} runs (max ${max}): ${times.map((t) => t.toFixed(0)).join(", ")}${retried}`);
process.exit(ok ? 0 : 1);
