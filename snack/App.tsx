import React, { useState } from 'react';
import { GameProvider } from './store/gameStore';
import HomeScreen from './screens/HomeScreen';
import GameScreen from './screens/GameScreen';

type Screen = { name: 'Home' } | { name: 'Game'; id: string };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'Home' });

  const navigateToGame = (id: string) => setScreen({ name: 'Game', id });
  const goBack = () => setScreen({ name: 'Home' });

  return (
    <GameProvider>
      {screen.name === 'Game' ? (
        <GameScreen id={screen.id} onBack={goBack} />
      ) : (
        <HomeScreen onNavigateToGame={navigateToGame} />
      )}
    </GameProvider>
  );
}
