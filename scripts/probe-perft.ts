/**
 * Ground-truth probe: asks the real engine for perft numbers and compares them
 * with the vendored rules library. Used to pin test constants and to localise
 * move-generator divergences.
 *
 * Usage:
 *   pnpm probe:perft              # depths 1..3, local only
 *   pnpm probe:perft 3 --divide   # per-root-move comparison against Pikafish
 */
import { existsSync } from 'node:fs';
import { parseManifest } from './engine-paths';
import { NodeProcessTransport } from './node-transport';
import { XiangqiRules } from '../packages/rules-xiangqi/src';

interface EnginePerft {
  total: number | null;
  perRoot: Map<string, number>;
}

/** Drive `go perft N` on a raw transport and parse the non-UCI output. */
async function enginePerft(depth: number): Promise<EnginePerft> {
  const manifest = parseManifest();
  const bin = process.env.CHESS_PIKAFISH ?? manifest.pikafishPath;
  if (!bin || !existsSync(bin)) throw new Error('pikafish binary missing — run `pnpm fetch:engines`');

  const transport = new NodeProcessTransport({ command: bin });
  const perRoot = new Map<string, number>();
  let total: number | null = null;
  let handshake = false;
  let collecting = false;

  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('perft timeout')), 120_000);
    transport.onLine(line => {
      if (!handshake) {
        if (line.trim() === 'uciok') {
          handshake = true;
          collecting = true;
          transport.write(`position startpos`);
          transport.write(`go perft ${depth}`);
        }
        return;
      }
      if (!collecting) return;
      const m = /^([a-i][0-9][a-i][0-9][a-z]?)\s*:\s*(\d+)/.exec(line.trim());
      if (m) {
        perRoot.set(m[1]!, Number(m[2]));
        return;
      }
      const t = /^Nodes searched\s*:\s*(\d+)/.exec(line.trim());
      if (t) {
        total = Number(t[1]);
        collecting = false;
        clearTimeout(timer);
        resolve();
      }
    });
  });

  transport.write('uci');
  await done;
  transport.kill();
  return { total, perRoot };
}

function localPerft(depth: number): number {
  return new XiangqiRules().perft(depth);
}

function localDivide(depth: number): Map<string, number> {
  const out = new Map<string, number>();
  const root = new XiangqiRules();
  for (const m of root.moves()) {
    const next = new XiangqiRules();
    next.move(m.uci);
    out.set(m.uci, depth <= 1 ? 1 : next.perft(depth - 1));
  }
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter(a => a !== '--');
  const divide = args.includes('--divide');
  const depthArg = Number(args.find(a => /^\d+$/.test(a)) ?? 3);

  console.log('--- local perft (vendored xiangqi.js) ---');
  for (let d = 1; d <= Math.min(depthArg, 3); d += 1) {
    const t0 = Date.now();
    console.log(`perft(${d}) = ${localPerft(d)}  (${Date.now() - t0}ms)`);
  }

  if (!divide) return;

  let truth: EnginePerft;
  try {
    truth = await enginePerft(depthArg);
  } catch (err) {
    console.error(`\n[engine perft] unavailable: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  const mine = localDivide(depthArg);
  console.log(`\n--- divide at depth ${depthArg} ---`);
  console.log(`engine total: ${truth.total}   local total: ${[...mine.values()].reduce((a, b) => a + b, 0)}`);

  const moves = [...new Set([...mine.keys(), ...truth.perRoot.keys()])].sort();
  let mismatches = 0;
  for (const mv of moves) {
    const a = mine.get(mv) ?? 0;
    const b = truth.perRoot.get(mv) ?? 0;
    if (a !== b) {
      mismatches += 1;
      console.log(`  DIFF ${mv}: local=${a} engine=${b} (delta ${a - b})`);
    }
  }
  if (mismatches === 0) console.log('  no per-root mismatches');
  else console.log(`  ${mismatches} mismatching root move(s)`);
}

void main();
