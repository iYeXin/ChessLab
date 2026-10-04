/**
 * Dev probe: diff our legal-move list against Pikafish after a move prefix.
 * Usage: npx tsx scripts/probe-moves.ts c0a2
 */
import { existsSync } from 'node:fs';
import { parseManifest } from './engine-paths';
import { NodeProcessTransport } from './node-transport';
import { XiangqiRules } from '../packages/rules-xiangqi/src';

async function engineMoves(prefix: string[]): Promise<string[]> {
  const manifest = parseManifest();
  const bin = process.env.CHESS_PIKAFISH ?? manifest.pikafishPath;
  if (!bin || !existsSync(bin)) throw new Error('pikafish binary missing');

  const transport = new NodeProcessTransport({ command: bin });
  const moves: string[] = [];
  let handshake = false;
  let collecting = false;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 60_000);
    transport.onLine(line => {
      const t = line.trim();
      if (!handshake) {
        if (t === 'uciok') {
          handshake = true;
          collecting = true;
          transport.write(
            prefix.length ? `position startpos moves ${prefix.join(' ')}` : 'position startpos',
          );
          transport.write('go perft 1');
        }
        return;
      }
      if (!collecting) return;
      const m = /^([a-i][0-9][a-i][0-9][a-z]?)\s*:\s*(\d+)/.exec(t);
      if (m) {
        moves.push(m[1]!);
        return;
      }
      if (/^Nodes searched/.test(t)) {
        collecting = false;
        clearTimeout(timer);
        resolve();
      }
    });
    transport.write('uci');
  });
  transport.kill();
  return moves.sort();
}

async function main(): Promise<void> {
  const prefix = process.argv.slice(2).filter(a => a !== '--');
  const engine = await engineMoves(prefix);

  const rules = new XiangqiRules();
  for (const mv of prefix) {
    if (!rules.move(mv)) throw new Error(`prefix move ${mv} illegal locally`);
  }
  const local = rules.moves().map(m => m.uci).sort();

  console.log(`position after: ${prefix.join(' ') || '(start)'}`);
  console.log(`turn: ${rules.turn()}   engine: ${engine.length}   local: ${local.length}`);
  const missing = engine.filter(m => !local.includes(m));
  const extra = local.filter(m => !engine.includes(m));
  console.log(`engine-only (we reject): ${missing.join(' ') || '-'}`);
  console.log(`local-only  (we allow):  ${extra.join(' ') || '-'}`);
}

void main();
