import React, { useState } from 'react';
import type { GameType, Side } from '@chesslab/rules-core';
import { HomeScreen, type StartConfig } from './screens/HomeScreen';
import { GameScreen } from './screens/GameScreen';
import { GameSetupScreen } from './screens/GameSetupScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';
import { SettingsProvider } from './state/settings';

type Route =
  | { name: 'home' }
  | { name: 'setup'; gameType: GameType }
  | { name: 'game'; cfg: StartConfig }
  | { name: 'settings' }
  | { name: 'diagnostics' };

function AppInner() {
  const [route, setRoute] = useState<Route>({ name: 'home' });

  switch (route.name) {
    case 'home':
      return (
        <HomeScreen
          onPickGameType={gt => setRoute({ name: 'setup', gameType: gt })}
          onSettings={() => setRoute({ name: 'settings' })}
          onDiagnostics={() => setRoute({ name: 'diagnostics' })}
        />
      );
    case 'setup':
      return (
        <GameSetupScreen
          gameType={route.gameType}
          onBack={() => setRoute({ name: 'home' })}
          onStart={cfg => setRoute({ name: 'game', cfg })}
        />
      );
    case 'game': {
      const cfg = route.cfg;
      return (
        <GameScreen
          key={`${cfg.gameType}:${cfg.mode}:${cfg.humanSide}:${cfg.difficulty}:${cfg.difficultySecond ?? ''}:${cfg.stepMode ? 'step' : 'auto'}`}
          cfg={cfg}
          onExit={() => setRoute({ name: 'home' })}
        />
      );
    }
    case 'settings':
      return <SettingsScreen onBack={() => setRoute({ name: 'home' })} />;
    case 'diagnostics':
      return <DiagnosticsScreen onBack={() => setRoute({ name: 'home' })} />;
  }
}

export function App() {
  return (
    <SettingsProvider>
      <AppInner />
    </SettingsProvider>
  );
}
