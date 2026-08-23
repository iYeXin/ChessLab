import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GameRecord, GameRepository } from './index';

/** JSON-per-game file repository (Node/dev tooling; device uses SQLite later). */
export class NodeFileGameRepository implements GameRepository {
  constructor(private dir: string) {}

  async save(record: GameRecord): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${record.id}.json`), JSON.stringify(record), 'utf8');
  }

  async get(id: string): Promise<GameRecord | null> {
    try {
      const raw = await readFile(join(this.dir, `${id}.json`), 'utf8');
      return JSON.parse(raw) as GameRecord;
    } catch {
      return null;
    }
  }

  async list(limit = 100): Promise<GameRecord[]> {
    await mkdir(this.dir, { recursive: true });
    const names = (await readdir(this.dir)).filter(n => n.endsWith('.json')).sort().reverse();
    const out: GameRecord[] = [];
    for (const n of names.slice(0, limit)) {
      const rec = await this.get(n.replace(/\.json$/, ''));
      if (rec) out.push(rec);
    }
    return out;
  }

  async delete(id: string): Promise<void> {
    try {
      await unlink(join(this.dir, `${id}.json`));
    } catch {
      /* already gone */
    }
  }
}
