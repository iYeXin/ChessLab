import type { GameType, MoveUci } from '@chessnext/rules-core';

/** Concrete engines shipped with the app; open string keeps it extensible. */
export type EngineId = 'pikafish' | (string & {});

export type UciOptionValue = string | number | boolean;

export interface EngineOptionDef {
  name: string;
  type: 'check' | 'spin' | 'combo' | 'button' | 'string';
  defaultValue?: string;
  min?: number;
  max?: number;
  vars?: string[];
}

/** Search constraints for one `go` command. */
export interface GoLimits {
  /** Fixed thinking time in milliseconds (safety cap on slow devices). */
  movetimeMs?: number;
  depth?: number;
  nodes?: number;
  infinite?: boolean;
  whiteTimeMs?: number;
  blackTimeMs?: number;
  whiteIncMs?: number;
  blackIncMs?: number;
  movesToGo?: number;
}

export interface EngineInfo {
  depth?: number;
  seldepth?: number;
  multipv?: number;
  /** Centipawn score (from the engine's point of view). */
  scoreCp?: number;
  /** Mate distance in plies; sign encodes who is mating. */
  scoreMate?: number;
  lowerbound?: boolean;
  upperbound?: boolean;
  pv: MoveUci[];
  currmove?: MoveUci;
  currmovenumber?: number;
  nodes?: number;
  nps?: number;
  timeMs?: number;
  hashfullPermill?: number;
  tbhits?: number;
  /** Content of `info string ...`. */
  text?: string;
}

export type UciEvent =
  | { kind: 'id'; name?: string; author?: string }
  | { kind: 'uciok' }
  | { kind: 'readyok' }
  | { kind: 'option'; option: EngineOptionDef }
  | { kind: 'info'; info: EngineInfo }
  | { kind: 'bestmove'; move: MoveUci; ponder?: MoveUci }
  | { kind: 'unparsed'; line: string };

/**
 * Transport-agnostic handle to a running engine binary. Implementations:
 * the Tauri process bridge used by the app, plus a Node child_process
 * transport for dev tooling (`scripts/node-transport.ts`, intentionally kept
 * out of this package so bundlers never pull `node:child_process` in).
 */
export interface EngineTransport {
  write(line: string): void;
  kill(): void;
  /** Resolves when the underlying process exits (code may be null). */
  readonly exited: Promise<number | null>;
  /**
   * Last stderr lines captured before the process exited, when the transport
   * can provide them. A dead engine's only explanation lives here (missing
   * NNUE, rejected option, illegal instruction), so it is surfaced to the user.
   */
  readonly stderrTail?: string;
  onLine(handler: (line: string) => void): void;
  onIOError(handler: (err: Error) => void): void;
}

export interface EngineProfile {
  id: EngineId;
  gameType: GameType;
  displayName: string;
  /** Binary base name without platform extension ("pikafish"). */
  binaryName: string;
  /** Applied right after handshake, before readyok ack. */
  defaultOptions: Record<string, UciOptionValue>;
  /**
   * Pikafish ships its NNUE as an external file: the host must resolve an
   * absolute path and pass it through `EvalFile` before first search.
   */
  requiresExternalNnue: boolean;
}
