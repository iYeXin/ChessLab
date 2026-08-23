import type { GameResult, GameType, MoveUci } from '@chesslab/rules-core';

/**
 * Persistence seam. MVP ships memory + Node-file implementations; the app
 * layer will back this with SQLite (op-sqlite) on device. Swapping in a
 * server-synced repository later requires zero changes above this interface.
 */

export interface GameRecord {
  id: string;
  gameType: GameType;
  startedAt: number; // epoch ms
  finishedAt?: number;
  initialFen?: string;
  /** Coordinate moves from the initial position — canonical, replayable. */
  moves: MoveUci[];
  result?: GameResult;
  meta?: {
    whiteName?: string;
    blackName?: string;
    timeControl?: { initialMs: number; incrementMs: number };
    engineProfiles?: { white?: string; black?: string };
  };
}

export interface GameRepository {
  save(record: GameRecord): Promise<void>;
  get(id: string): Promise<GameRecord | null>;
  list(limit?: number): Promise<GameRecord[]>;
  delete(id: string): Promise<void>;
}

export class MemoryGameRepository implements GameRepository {
  private store = new Map<string, GameRecord>();

  async save(record: GameRecord): Promise<void> {
    this.store.set(record.id, structuredClone(record));
  }

  async get(id: string): Promise<GameRecord | null> {
    const r = this.store.get(id);
    return r ? structuredClone(r) : null;
  }

  async list(limit = 100): Promise<GameRecord[]> {
    return [...this.store.values()]
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit)
      .map(r => structuredClone(r));
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

export { NodeFileGameRepository } from './node-file';
