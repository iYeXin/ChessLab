import { spawn, type ChildProcess } from 'node:child_process';
import type { EngineTransport } from '@chesslab/engine-uci';
import type { EngineSpawnSpec, TransportFactory } from './index';

/** Node.js child_process transport — used by tests, CI smoke runs and tooling. */
export function createNodeTransportFactory(): TransportFactory {
  return async (spec: EngineSpawnSpec) => new NodeProcessTransport(spec);
}

export class NodeProcessTransport implements EngineTransport {
  private child: ChildProcess;
  private lineHandlers = new Set<(line: string) => void>();
  private errorHandlers = new Set<(err: Error) => void>();
  private buffer = '';

  readonly exited: Promise<number | null>;

  constructor(private spec: EngineSpawnSpec) {
    this.child = spawn(spec.command, [...(spec.args ?? [])], {
      cwd: spec.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stdout?.setEncoding('utf8');
    this.child.stdout?.on('data', (chunk: string) => this.consume(chunk));
    this.child.stderr?.setEncoding('utf8');
    // Engines occasionally write benign diagnostics to stderr; drain it.
    this.child.stderr?.on('data', () => undefined);

    this.exited = new Promise<number | null>(resolve => {
      this.child.once('exit', code => resolve(code));
      this.child.once('error', err => {
        for (const h of this.errorHandlers) h(err);
        resolve(null);
      });
    });
    this.exited.catch(() => undefined);
  }

  write(line: string): void {
    if (!this.child.stdin?.writable) throw new Error(`engine stdin closed: ${this.spec.command}`);
    this.child.stdin.write(`${line}\n`);
  }

  kill(): void {
    if (this.child.exitCode === null && !this.child.killed) {
      try {
        this.child.kill();
      } catch {
        /* already gone */
      }
    }
  }

  onLine(handler: (line: string) => void): void {
    this.lineHandlers.add(handler);
  }

  onIOError(handler: (err: Error) => void): void {
    this.errorHandlers.add(handler);
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    let idx = this.buffer.indexOf('\n');
    while (idx >= 0) {
      const line = this.buffer.slice(0, idx).replace(/\r$/, '');
      if (line.length > 0) {
        for (const h of this.lineHandlers) h(line);
      }
      this.buffer = this.buffer.slice(idx + 1);
      idx = this.buffer.indexOf('\n');
    }
  }
}
