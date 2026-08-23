/**
 * Ground-truth probe: asks real engines for perft numbers / handshake info.
 * Used to pin rule-library test constants and verify the UCI layer end-to-end.
 */
import { NodeProcessTransport } from '../packages/engine-process/src/node';
import { UciEngineDriver } from '../packages/engine-uci/src';
import { PIKAFISH_PROFILE, STOCKFISH_PROFILE } from '../packages/engine-uci/src';
import { parseManifest } from './engine-paths';

async function pikafishPerft(): Promise<void> {
  const m = parseManifest();
  if (!m.pikafishPath) throw new Error('pikafish binary missing');
  const driver = new UciEngineDriver(PIKAFISH_PROFILE, {
    debug: msg => process.stdout.write(`    ${msg}\n`),
  });
  await driver.start(new NodeProcessTransport({ command: m.pikafishPath }));
  console.log(`engine: ${driver.name}`);
  console.log(
    `options: Threads=${driver.availableOptions.has('Threads')} EvalFile=${driver.availableOptions.has('EvalFile')} SkillLevel=${driver.availableOptions.has('Skill Level')} LimitStrength=${driver.availableOptions.has('UCI_LimitStrength')}`,
  );

  // Perft via `go perft N` — output arrives as "info string ..." style lines?
  // Stockfish-family prints raw perft lines then "Nodes searched: X".
  // Those lines are not standard UCI; parse them from a side channel instead:
  // use `position startpos` + `go perft N` and capture unparsed lines.
  for (const depth of [1, 2, 3]) {
    const lines: string[] = [];
    const t = driver as unknown as { handleLine?: (l: string) => void };
    void t;
    // Simplest: send go perft and collect everything until "Nodes searched".
    const result = await new Promise<string>((resolve, reject) => {
      const transport = (driver as unknown as { transport: { onLine: (cb: (l: string) => void) => void; write: (s: string) => void } }).transport;
      if (!transport) return reject(new Error('no transport'));
      const timer = setTimeout(() => reject(new Error('perft timeout')), 30000);
      let buf = '';
      transport.onLine((line: string) => {
        buf += line + '\n';
        if (/Nodes searched/.test(line)) {
          clearTimeout(timer);
          resolve(buf);
        }
      });
      transport.write(`position startpos`);
      transport.write(`go perft ${depth}`);
    });
    const nodesLine = result
      .split('\n')
      .find(l => l.startsWith('Nodes searched'))
      ?.trim();
    console.log(`perft(${depth}): ${nodesLine ?? '??'}`);
    lines.length = 0;
  }
  await driver.quit();
}

async function stockfishSanity(): Promise<void> {
  const m = parseManifest();
  if (!m.stockfishPath) throw new Error('stockfish binary missing');
  const driver = new UciEngineDriver(STOCKFISH_PROFILE);
  await driver.start(new NodeProcessTransport({ command: m.stockfishPath }));
  console.log(`engine: ${driver.name}`);
  const res = await driver.search({ fen: 'k7/8/1K6/8/8/8/8/7R w - - 0 1' }, { movetimeMs: 1200 });
  console.log(`mate-in-1 bestmove: ${res.bestmove}`);
  // Chess perft d2 from startpos should be 400.
  await driver.quit();
}

async function main(): Promise<void> {
  const filter = process.argv[2]; // 'sf' | 'pf' | undefined (both)
  if (filter !== 'sf') {
    try {
      await pikafishPerft();
    } catch (err) {
      console.error(`[pf probe] FAILED: ${String(err)}`);
    }
  }
  if (filter !== 'pf') {
    try {
      await stockfishSanity();
    } catch (err) {
      console.error(`[sf probe] FAILED: ${String(err)}`);
      process.exitCode = 1;
    }
  }
}

void main();
