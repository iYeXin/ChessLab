import { useCallback, useEffect, useState } from 'react';
import type { Puzzle } from '@chesslab/puzzles';

const STORAGE_KEY = 'chesslab.puzzles.progress.v1';

interface StoredProgress {
  solved: Record<string, boolean>;
  solvedAt: Record<string, number>;
}

function load(): StoredProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { solved: {}, solvedAt: {} };
    const parsed = JSON.parse(raw) as StoredProgress;
    return { solved: parsed.solved ?? {}, solvedAt: parsed.solvedAt ?? {} };
  } catch {
    return { solved: {}, solvedAt: {} };
  }
}

function save(p: StoredProgress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {}
}

export function usePuzzleProgress() {
  const [progress, setProgress] = useState<StoredProgress>(() => load());

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

export function getSolvedCount(puzzles: Puzzle[], progress: StoredProgress): number {
  return puzzles.filter(p => progress.solved[p.id]).length;
}
