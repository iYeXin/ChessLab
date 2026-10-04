import { useCallback, useEffect, useState } from 'react';
import type { Puzzle, PuzzleProgress } from '@chessnext/puzzles';

const STORAGE_KEY = 'chessnext.puzzles.progress.v1';

function load(): PuzzleProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { solved: {}, solvedAt: {} };
    const parsed = JSON.parse(raw) as Partial<PuzzleProgress>;
    return { solved: parsed.solved ?? {}, solvedAt: parsed.solvedAt ?? {} };
  } catch {
    return { solved: {}, solvedAt: {} };
  }
}

function save(p: PuzzleProgress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {}
}

export function usePuzzleProgress() {
  const [progress, setProgress] = useState<PuzzleProgress>(() => load());

  useEffect(() => {
    save(progress);
  }, [progress]);

  const markSolved = useCallback((id: string) => {
    setProgress(prev => {
      if (prev.solved[id]) return prev;
      return { solved: { ...prev.solved, [id]: true }, solvedAt: { ...prev.solvedAt, [id]: Date.now() } };
    });
  }, []);

  const isSolved = useCallback((id: string) => !!progress.solved[id], [progress.solved]);

  const reset = useCallback(() => {
    setProgress({ solved: {}, solvedAt: {} });
  }, []);

  return { progress, markSolved, isSolved, reset };
}

export function getSolvedCount(puzzles: Puzzle[], progress: PuzzleProgress): number {
  return puzzles.filter(p => progress.solved[p.id]).length;
}
