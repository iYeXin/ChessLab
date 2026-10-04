import { describe, expect, it } from 'vitest';
import { parseUciLine, uciCommands } from '../src/protocol';

describe('parseUciLine', () => {
  it('parses engine id', () => {
    const ev = parseUciLine('id name Pikafish 2026-01-02');
    expect(ev).toEqual({ kind: 'id', name: 'Pikafish 2026-01-02' });
    expect(parseUciLine('id author the Pikafish developers')).toEqual({
      kind: 'id',
      author: 'the Pikafish developers',
    });
  });

  it('parses acks', () => {
    expect(parseUciLine('uciok').kind).toBe('uciok');
    expect(parseUciLine('readyok').kind).toBe('readyok');
  });

  it('parses spin options with min/max', () => {
    expect(parseUciLine('option name Threads type spin default 1 min 1 max 1024')).toEqual({
      kind: 'option',
      option: {
        name: 'Threads',
        type: 'spin',
        defaultValue: '1',
        min: 1,
        max: 1024,
      },
    });
  });

  it('parses multi-word option names and defaults', () => {
    // Real-world shape from Pikafish.
    const ev = parseUciLine(
      'option name EvalFile type string default nn-b1a57edbea57.nnue',
    );
    expect(ev.kind === 'option' && ev.option).toMatchObject({
      name: 'EvalFile',
      type: 'string',
      defaultValue: 'nn-b1a57edbea57.nnue',
    });
  });

  it('parses combo options with vars', () => {
    const ev = parseUciLine('option name Style type combo default Normal var Solid var Normal var Risky');
    expect(ev.kind === 'option' && ev.option.vars).toEqual(['Solid', 'Normal', 'Risky']);
  });

  it('parses full info line with pv', () => {
    const ev = parseUciLine(
      'info depth 12 seldepth 15 multipv 1 score cp 34 nodes 123456 nps 120000 hashfull 250 tbhits 0 time 1028 pv e2e4 e7e5 g1f3 b8c6',
    );
    expect(ev.kind).toBe('info');
    if (ev.kind !== 'info') return;
    expect(ev.info.depth).toBe(12);
    expect(ev.info.seldepth).toBe(15);
    expect(ev.info.multipv).toBe(1);
    expect(ev.info.scoreCp).toBe(34);
    expect(ev.info.nodes).toBe(123456);
    expect(ev.info.nps).toBe(120000);
    expect(ev.info.hashfullPermill).toBe(250);
    expect(ev.info.tbhits).toBe(0);
    expect(ev.info.timeMs).toBe(1028);
    expect(ev.info.pv).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
  });

  it('parses mate scores and bound flags', () => {
    const mate = parseUciLine('info depth 9 score mate 3 pv h1h8');
    expect(mate.kind).toBe('info');
    if (mate.kind === 'info') expect(mate.info.scoreMate).toBe(3);

    const bound = parseUciLine('info depth 5 score cp -12 upperbound nodes 100 pv a1a2');
    expect(bound.kind).toBe('info');
    if (bound.kind !== 'info') return;
    expect(bound.info.upperbound).toBe(true);
    expect(bound.info.lowerbound ?? false).toBe(false);
  });

  it('parses negative mate and multipv lines', () => {
    const ev = parseUciLine('info depth 4 multipv 2 score mate -2 pv c7c8');
    expect(ev.kind === 'info' && ev.info.scoreMate).toBe(-2);
    expect(ev.kind === 'info' && ev.info.multipv).toBe(2);
  });

  it('parses info strings', () => {
    const ev = parseUciLine('info string NNUE evaluation using nn-abc.nnue enabled');
    expect(ev.kind === 'info' && ev.info.text).toBe('NNUE evaluation using nn-abc.nnue enabled');
  });

  it('parses currmove noise', () => {
    const ev = parseUciLine('info depth 10 currmove g1f3 currmovenumber 5 nodes 90000');
    expect(ev.kind === 'info' && ev.info.currmove).toBe('g1f3');
    expect(ev.kind === 'info' && ev.info.currmovenumber).toBe(5);
  });

  it('parses bestmove with and without ponder', () => {
    expect(parseUciLine('bestmove e2e4 ponder e7e5')).toEqual({
      kind: 'bestmove',
      move: 'e2e4',
      ponder: 'e7e5',
    });
    expect(parseUciLine('bestmove h2e2')).toEqual({ kind: 'bestmove', move: 'h2e2' });
    expect(parseUciLine('bestmove (none)')).toEqual({ kind: 'bestmove', move: '(none)' });
  });
});

describe('uciCommands', () => {
  it('builds position commands', () => {
    expect(uciCommands.position({})).toBe('position startpos');
    expect(uciCommands.position({ moves: ['e2e4'] })).toBe('position startpos moves e2e4');
    expect(
      uciCommands.position({ fen: 'k7/8/8/8/8/8/8/K7 w - - 0 1', moves: ['a1b1'] }),
    ).toBe('position fen k7/8/8/8/8/8/8/K7 w - - 0 1 moves a1b1');
  });

  it('builds go commands', () => {
    expect(uciCommands.go({ movetimeMs: 1500 })).toBe('go movetime 1500');
    expect(uciCommands.go({ depth: 12 })).toBe('go depth 12');
    expect(
      uciCommands.go({ whiteTimeMs: 60000, blackTimeMs: 30000, whiteIncMs: 500 }),
    ).toBe('go wtime 60000 btime 30000 winc 500');
    expect(uciCommands.go({ infinite: true })).toBe('go infinite');
  });

  it('builds setoption commands', () => {
    expect(uciCommands.setOption('Hash', 256)).toBe('setoption name Hash value 256');
    expect(uciCommands.setOption('EvalFile', 'pikafish.nnue')).toBe(
      'setoption name EvalFile value pikafish.nnue',
    );
  });
});
