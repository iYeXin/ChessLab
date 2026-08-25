import React, { useEffect, useState } from 'react';
import type { GameType } from '@chesslab/rules-core';
import { HomeScreen, type StartConfig } from './screens/HomeScreen';
import { GameScreen } from './screens/GameScreen';
import { GameSetupScreen } from './screens/GameSetupScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';
import { PuzzlesScreen } from './screens/PuzzlesScreen';
import { PuzzleScreen } from './screens/PuzzleScreen';
import { SettingsProvider } from './state/settings';
import { getPuzzleById, getPuzzlesByGameType, getLargeByGameType } from '@chesslab/puzzles';

type Route =
  | { name: 'home' }
  | { name: 'setup'; gameType: GameType }
  | { name: 'game'; cfg: StartConfig }
  | { name: 'settings' }
  | { name: 'diagnostics' }
  | { name: 'puzzles' }
  | { name: 'puzzle'; id: string };

function routeToHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#home';
    case 'setup':
      return `#setup:${route.gameType}`;
    case 'game':
      return `#game:${route.cfg.gameType}:${route.cfg.mode}`;
    case 'settings':
      return '#settings';
    case 'diagnostics':
      return '#diagnostics';
    case 'puzzles':
      return '#puzzles';
    case 'puzzle':
      return `#puzzle:${route.id}`;
  }
}

function AppInner() {
  const [route, setRoute] = useState<Route>(() => {
    const h = window.location.hash;
    if (h.startsWith('#setup:')) {
      const gt = h.split(':')[1] as GameType;
      if (gt === 'chess' || gt === 'xiangqi') return { name: 'setup', gameType: gt };
    }
    if (h.startsWith('#puzzle:')) {
      const id = h.slice('#puzzle:'.length);
      if (getPuzzleById(id)) return { name: 'puzzle', id };
    }
    if (h === '#puzzles') return { name: 'puzzles' };
    if (h === '#settings') return { name: 'settings' };
    if (h === '#diagnostics') return { name: 'diagnostics' };
    return { name: 'home' };
  });

  const navigate = (next: Route) => {
    const toHash = routeToHash(next);
    const fromHash = routeToHash(route);
    if (fromHash !== toHash) window.history.pushState({ route: next }, '', toHash);
    setRoute(next);
  };

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState({ route: { name: 'home' } }, '', '#home');
    const onPopState = (e: PopStateEvent) => {
      const st = (e.state as { route?: Route } | null)?.route;
      if (st) {
        setRoute(st);
        return;
      }
      const h = window.location.hash;
      if (h === '#home' || !h) setRoute({ name: 'home' });
      else if (h.startsWith('#setup:')) {
        const gt = h.split(':')[1] as GameType;
        if (gt === 'chess' || gt === 'xiangqi') setRoute({ name: 'setup', gameType: gt });
        else setRoute({ name: 'home' });
      } else if (h.startsWith('#puzzle:')) {
        const id = h.slice('#puzzle:'.length);
        if (getPuzzleById(id)) setRoute({ name: 'puzzle', id });
        else setRoute({ name: 'puzzles' });
      } else if (h === '#puzzles') setRoute({ name: 'puzzles' });
      else if (h === '#settings') setRoute({ name: 'settings' });
      else if (h === '#diagnostics') setRoute({ name: 'diagnostics' });
      else setRoute({ name: 'home' });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [route]);

  switch (route.name) {
    case 'home':
      return (
        <HomeScreen
          onPickGameType={gt => navigate({ name: 'setup', gameType: gt })}
          onPuzzles={() => navigate({ name: 'puzzles' })}
          onSettings={() => navigate({ name: 'settings' })}
          onDiagnostics={() => navigate({ name: 'diagnostics' })}
        />
      );
    case 'setup':
      return <GameSetupScreen gameType={route.gameType} onBack={() => window.history.back()} onStart={cfg => navigate({ name: 'game', cfg })} />;
    case 'game': {
      const cfg = route.cfg;
      return <GameScreen key={`${cfg.gameType}:${cfg.mode}:${cfg.humanSide}:${cfg.difficulty}:${cfg.difficultySecond ?? ''}:${cfg.stepMode ? 'step' : 'auto'}`} cfg={cfg} onExit={() => window.history.back()} />;
    }
    case 'settings':
      return <SettingsScreen onBack={() => window.history.back()} />;
    case 'diagnostics':
      return <DiagnosticsScreen onBack={() => window.history.back()} />;
    case 'puzzles':
      return <PuzzlesScreen onBack={() => window.history.back()} onPick={p => navigate({ name: 'puzzle', id: p.id })} />;
    case 'puzzle': {
      const p = getPuzzleById(route.id);
      if (!p) return <PuzzlesScreen onBack={() => window.history.back()} onPick={pp => navigate({ name: 'puzzle', id: pp.id })} />;
      const isLarge = p.id.includes('-large-');
      const list = isLarge ? getLargeByGameType(p.gameType) : getPuzzlesByGameType(p.gameType);
      const idx = list.findIndex(x => x.id === p.id);
      const hasPrev = idx > 0;
      const hasNext = idx >= 0 && idx < list.length - 1;
      return (
        <PuzzleScreen
          key={p.id}
          puzzle={p}
          onBack={() => window.history.back()}
          onPrev={() => {
            if (hasPrev) navigate({ name: 'puzzle', id: list[idx - 1]!.id });
          }}
          onNext={() => {
            if (hasNext) navigate({ name: 'puzzle', id: list[idx + 1]!.id });
          }}
          hasPrev={hasPrev}
          hasNext={hasNext}
        />
      );
    }
  }
}

export function App() {
  return (
    <SettingsProvider>
      <AppInner />
    </SettingsProvider>
  );
}
