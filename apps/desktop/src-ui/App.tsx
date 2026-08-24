import React, { useState } from 'react';
import type { GameType, Side } from '@chesslab/rules-core';
import { HomeScreen, type StartConfig } from './screens/HomeScreen';
import { GameScreen } from './screens/GameScreen';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';

type Route =
  | { name: 'home' }
  | { name: 'game'; cfg: StartConfig }
  | { name: 'diagnostics' };

export function App() {
  // TEMP-DIAG: start directly on the game screen for screenshot iteration.
  const [route, setRoute] = useState<Route>({
    name: 'game',
    cfg: { gameType: 'xiangqi', humanSide: 'w', difficulty: 2 },
  });

  switch (route.name) {
    case 'home':
      return (
        <HomeScreen
          onStart={(cfg: StartConfig) => setRoute({ name: 'game', cfg })}
          onDiagnostics={() => setRoute({ name: 'diagnostics' })}
        />
      );
    case 'game': {
      const cfg = route.cfg;
      return (
        <GameScreen
          key={`${cfg.gameType}:${cfg.humanSide}`}
          gameType={cfg.gameType as GameType}
          humanSide={cfg.humanSide as Side}
          difficulty={cfg.difficulty}
          onExit={() => setRoute({ name: 'home' })}
        />
      );
    }
    case 'diagnostics':
      return <DiagnosticsScreen onBack={() => setRoute({ name: 'home' })} />;
  }
}
