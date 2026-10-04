import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryGameRepository, NodeFileGameRepository, type GameRecord } from '../src';

const sample = (): GameRecord => ({
  id: 'g1',
  gameType: 'xiangqi',
  startedAt: 1735689600000,
  finishedAt: 1735689900000,
  moves: ['h2e2', 'h9g7', 'e2e6'],
  result: { winner: 'w', reason: 'checkmate' },
  meta: {
    whiteName: '红方',
    blackName: 'Pikafish',
    timeControl: { initialMs: 600000, incrementMs: 5000 },
    engineProfiles: { black: 'pikafish' },
  },
});

describe('MemoryGameRepository', () => {
  it('round-trips records', async () => {
    const repo = new MemoryGameRepository();
    await repo.save(sample());
    expect(await repo.get('g1')).toEqual(sample());
    expect(await repo.get('missing')).toBeNull();
    expect((await repo.list()).map(r => r.id)).toEqual(['g1']);
    await repo.delete('g1');
    expect(await repo.get('g1')).toBeNull();
  });
});

describe('NodeFileGameRepository', () => {
  it('round-trips records through the filesystem', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'chessnext-')), 'games');
    const repo = new NodeFileGameRepository(dir);
    await repo.save(sample());

    // Fresh instance over the same dir proves real persistence.
    const fresh = new NodeFileGameRepository(dir);
    expect(await fresh.get('g1')).toEqual(sample());
    expect(await fresh.list()).toHaveLength(1);
  });
});
