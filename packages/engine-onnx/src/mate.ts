import type { RulesAdapter } from '@chessnext/rules-core';

/**
 * Mate guard (research doc §7) — measured +90..+180 Elo for free, no retraining.
 *
 * Two layers:
 *  1. If ANY legal move leaves the opponent with no legal reply, play it.
 *     In xiangqi "no legal move" loses (困毙 as well as 将死), so this single
 *     test covers both. It must scan EVERY legal move — the doc measured that
 *     looking only at the model's top-8 candidates misses 57% of the wins.
 *  2. Prefer moves after which the opponent has no such immediate win.
 *
 * Cost is bounded by the caller (`MATE_GUARD_TOP_K`), because layer 2 is
 * O(candidates x opponent moves).
 */

/** The move that immediately wins by leaving the opponent with no reply. */
export function findWinningMove(rules: RulesAdapter): string | null {
  for (const m of rules.moves()) {
    if (!rules.move(m.uci)) continue;
    const noReply = rules.moves().length === 0;
    rules.undo();
    if (noReply) return m.uci;
  }
  return null;
}

/**
 * Would `uci`, played now, hand the opponent an immediate winning move?
 * Leaves the adapter exactly as it found it.
 */
export function allowsOpponentWin(rules: RulesAdapter, uci: string): boolean {
  if (!rules.move(uci)) return false;
  const opponentWins = findWinningMove(rules) !== null;
  rules.undo();
  return opponentWins;
}
