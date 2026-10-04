import React, { useEffect, useState } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { GameScreen } from './screens/GameScreen';
import { GameSetupScreen } from './screens/GameSetupScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';
import { PuzzlesScreen } from './screens/PuzzlesScreen';
import { PuzzleScreen } from './screens/PuzzleScreen';
import { SettingsProvider } from './state/settings';
import type { StartConfig } from './state/useGameSession';
import { getPuzzleById, listForPuzzle } from '@chessnext/puzzles';

type Route =
  | { name: 'home' }
  | { name: 'setup' }
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
      return '#setup';
    case 'game':
      return `#game:${route.cfg.mode}`;
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

function parseHash(h: string): Route {
  if (h === '#setup') return { name: 'setup' };
  if (h.startsWith('#puzzle:')) {
    const id = h.slice('#puzzle:'.length);
    if (getPuzzleById(id)) return { name: 'puzzle', id };
    return { name: 'puzzles' };
  }
  if (h === '#puzzles') return { name: 'puzzles' };
  if (h === '#settings') return { name: 'settings' };
  if (h === '#diagnostics') return { name: 'diagnostics' };
  return { name: 'home' };
}

function AppInner() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

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
      setRoute(st ?? parseHash(window.location.hash));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [route]);

  switch (route.name) {
    case 'home':
      return (
        <HomeScreen
          onPlay={() => navigate({ name: 'setup' })}
          onPuzzles={() => navigate({ name: 'puzzles' })}
          onSettings={() => navigate({ name: 'settings' })}
          onDiagnostics={() => navigate({ name: 'diagnostics' })}
        />
      );
    case 'setup':
      return (
        <GameSetupScreen
          onBack={() => window.history.back()}
          onStart={cfg => navigate({ name: 'game', cfg })}
        />
      );
    case 'game': {
      const cfg = route.cfg;
      return (
        <GameScreen
          key={`${cfg.mode}:${cfg.humanSide}:${cfg.difficulty}:${cfg.difficultySecond ?? ''}:${cfg.stepMode ? 'step' : 'auto'}`}
          cfg={cfg}
          onExit={() => window.history.back()}
        />
      );
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
      const list = listForPuzzle(p);
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
