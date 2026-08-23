import type { EngineInfo, EngineOptionDef, GoLimits, UciEvent } from './types';

/**
 * UCI text protocol: line parsing + command building.
 * Pure functions only — trivially unit-testable, no I/O.
 */

export function parseUciLine(line: string): UciEvent {
  const trimmed = line.replace(/\r$/, '');
  if (trimmed.length === 0) return { kind: 'unparsed', line: trimmed };
  const tokens = trimmed.split(/\s+/);
  const head = tokens[0];

  switch (head) {
    case 'id':
      if (tokens[1] === 'name') return { kind: 'id', name: tokens.slice(2).join(' ') };
      if (tokens[1] === 'author') return { kind: 'id', author: tokens.slice(2).join(' ') };
      return { kind: 'unparsed', line: trimmed };

    case 'uciok':
      return { kind: 'uciok' };
    case 'readyok':
      return { kind: 'readyok' };

    case 'bestmove': {
      const move = tokens[1];
      if (!move) return { kind: 'unparsed', line: trimmed };
      const ponderIdx = tokens.indexOf('ponder');
      const ponder = ponderIdx > 0 ? tokens[ponderIdx + 1] : undefined;
      return { kind: 'bestmove', move, ...(ponder ? { ponder } : {}) };
    }

    case 'option': {
      const option = parseOptionDef(tokens.slice(1));
      if (option) return { kind: 'option', option };
      return { kind: 'unparsed', line: trimmed };
    }

    case 'info': {
      const info = parseInfo(tokens.slice(1));
      if (info) return { kind: 'info', info };
      return { kind: 'unparsed', line: trimmed };
    }

    default:
      return { kind: 'unparsed', line: trimmed };
  }
}

/** `name <name...> type <type> [default <v...>] [min n] [max n] [var <v> ...]` */
function parseOptionDef(tokens: string[]): EngineOptionDef | null {
  if (tokens[0] !== 'name') return null;
  let i = 1;
  const nameParts: string[] = [];
  while (i < tokens.length) {
    const tk = tokens[i];
    if (tk === undefined || (tk === 'type' && i + 1 < tokens.length)) break;
    nameParts.push(tk);
    i += 1;
  }
  const name = nameParts.join(' ');
  const type = tokens[i + 1];
  if (!name || !isOptionType(type)) return null;

  const def: EngineOptionDef = { name, type };

  let j = i + 2;
  while (j < tokens.length) {
    const key = tokens[j];
    if (key === 'min' || key === 'max') {
      const num = Number(tokens[j + 1]);
      if (Number.isFinite(num)) def[key] = num;
      j += 2;
    } else if (key === 'default') {
      const valueParts: string[] = [];
      j += 1;
      while (j < tokens.length) {
        const tk = tokens[j];
        if (tk === undefined || tk === 'min' || tk === 'max' || tk === 'var') break;
        valueParts.push(tk);
        j += 1;
      }
      def.defaultValue = valueParts.join(' ');
    } else if (key === 'var') {
      def.vars = def.vars ?? [];
      // A combo var is a single token per UCI spec.
      const v = tokens[j + 1];
      if (v !== undefined) def.vars.push(v);
      j += 2;
    } else {
      j += 1;
    }
  }
  return def;
}

function isOptionType(t: string | undefined): t is EngineOptionDef['type'] {
  return t === 'check' || t === 'spin' || t === 'combo' || t === 'button' || t === 'string';
}

const SCALAR_INFO_KEYS = new Set([
  'depth',
  'seldepth',
  'multipv',
  'currmovenumber',
  'nodes',
  'nps',
  'hashfull',
  'tbhits',
  'time',
]);

/** Parse the key/value soup after `info`. Returns null when nothing usable. */
function parseInfo(tokens: string[]): EngineInfo | null {
  const info: EngineInfo = { pv: [] };
  let sawAnything = false;
  let i = 0;
  while (i < tokens.length) {
    const key = tokens[i] ?? '';
    if (key === 'score') {
      sawAnything = true;
      const kind = tokens[i + 1];
      const rawValue = Number(tokens[i + 2]);
      if ((kind === 'cp' || kind === 'mate') && Number.isFinite(rawValue)) {
        if (kind === 'cp') info.scoreCp = rawValue;
        else info.scoreMate = rawValue;
      }
      let k = i + 3;
      while (k < tokens.length && (tokens[k] === 'upperbound' || tokens[k] === 'lowerbound')) {
        if (tokens[k] === 'upperbound') info.upperbound = true;
        else info.lowerbound = true;
        k += 1;
      }
      i = k;
    } else if (key === 'pv') {
      sawAnything = true;
      i += 1;
      const pv: string[] = [];
      while (i < tokens.length) {
        const tk = tokens[i];
        if (
          tk === undefined ||
          SCALAR_INFO_KEYS.has(tk) ||
          tk === 'score' ||
          tk === 'string'
        ) {
          break;
        }
        pv.push(tk);
        i += 1;
      }
      info.pv = pv;
    } else if (key === 'currmove') {
      sawAnything = true;
      info.currmove = tokens[i + 1];
      i += 2;
    } else if (key === 'string') {
      info.text = tokens.slice(i + 1).join(' ');
      return Object.keys(info).length > 1 ? info : null;
    } else if (SCALAR_INFO_KEYS.has(key)) {
      sawAnything = true;
      const num = Number(tokens[i + 1]);
      if (Number.isFinite(num)) {
        switch (key) {
          case 'depth': info.depth = num; break;
          case 'seldepth': info.seldepth = num; break;
          case 'multipv': info.multipv = num; break;
          case 'currmovenumber': info.currmovenumber = num; break;
          case 'nodes': info.nodes = num; break;
          case 'nps': info.nps = num; break;
          case 'hashfull': info.hashfullPermill = num; break;
          case 'tbhits': info.tbhits = num; break;
          case 'time': info.timeMs = num; break;
        }
      }
      i += 2;
    } else {
      // Unknown key: skip one token to avoid infinite loops on exotic engines.
      i += 1;
    }
  }
  return sawAnything ? info : null;
}

// ---------------------------------------------------------------------------
// Command builders
// ---------------------------------------------------------------------------

export const uciCommands = {
  uci: (): string => 'uci',
  isReady: (): string => 'isready',
  newGame: (): string => 'ucinewgame',
  stop: (): string => 'stop',
  quit: (): string => 'quit',

  setOption(name: string, value: string | number | boolean): string {
    return `setoption name ${name} value ${value}`;
  },

  position(opts: { fen?: string; moves?: readonly string[] }): string {
    const moves = opts.moves ?? [];
    const base = opts.fen ? `position fen ${opts.fen}` : 'position startpos';
    return moves.length > 0 ? `${base} moves ${moves.join(' ')}` : base;
  },

  go(limits: GoLimits): string {
    const parts: string[] = ['go'];
    if (limits.movetimeMs !== undefined) parts.push(`movetime ${Math.max(0, Math.round(limits.movetimeMs))}`);
    if (limits.depth !== undefined) parts.push(`depth ${limits.depth}`);
    if (limits.nodes !== undefined) parts.push(`nodes ${limits.nodes}`);
    if (limits.whiteTimeMs !== undefined) parts.push(`wtime ${Math.max(0, Math.round(limits.whiteTimeMs))}`);
    if (limits.blackTimeMs !== undefined) parts.push(`btime ${Math.max(0, Math.round(limits.blackTimeMs))}`);
    if (limits.whiteIncMs !== undefined) parts.push(`winc ${Math.max(0, Math.round(limits.whiteIncMs))}`);
    if (limits.blackIncMs !== undefined) parts.push(`binc ${Math.max(0, Math.round(limits.blackIncMs))}`);
    if (limits.movesToGo !== undefined) parts.push(`movestogo ${limits.movesToGo}`);
    if (limits.infinite) parts.push('infinite');
    return parts.join(' ');
  },
};
