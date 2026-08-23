import React, { useState } from 'react';
import { HomeScreen, type StartConfig } from './src/screens/HomeScreen';
import { GameScreen } from './src/screens/GameScreen';
import { DiagnosticsScreen } from './src/screens/DiagnosticsScreen';

type Route =
  | { name: 'home' }
  | { name: 'game'; cfg: StartConfig }
  | { name: 'diagnostics' };

export default function App(): React.JSX.Element {
  const [route, setRoute] = useState<Route>({ name: 'home' });

  if (route.name === 'game') {
    return (
      <GameScreen
        key={`${route.cfg.gameType}-${route.cfg.humanSide}-${route.cfg.difficulty}-${Date.now()}`}
        gameType={route.cfg.gameType}
        humanSide={route.cfg.humanSide}
        difficulty={route.cfg.difficulty}
        onExit={() => setRoute({ name: 'home' })}
      />
    );
  }
  if (route.name === 'diagnostics') {
    return <DiagnosticsScreen onBack={() => setRoute({ name: 'home' })} />;
  }
  return (
    <HomeScreen
      onStart={cfg => setRoute({ name: 'game', cfg })}
      onDiagnostics={() => setRoute({ name: 'diagnostics' })}
    />
  );
}
