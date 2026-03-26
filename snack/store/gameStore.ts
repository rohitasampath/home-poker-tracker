import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { GameSession, Player, BuyIn } from '../types';

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface State { games: GameSession[] }

type Action =
  | { type: 'CREATE_GAME'; id: string; name: string }
  | { type: 'DELETE_GAME'; gameId: string }
  | { type: 'END_GAME'; gameId: string }
  | { type: 'ADD_PLAYER'; gameId: string; name: string; playerId: string }
  | { type: 'REMOVE_PLAYER'; gameId: string; playerId: string }
  | { type: 'ADD_BUY_IN'; gameId: string; playerId: string; amount: number; buyInId: string }
  | { type: 'SET_CASH_OUT'; gameId: string; playerId: string; amount: number }
  | { type: 'CLEAR_CASH_OUT'; gameId: string; playerId: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'CREATE_GAME':
      return {
        games: [
          { id: action.id, name: action.name.trim() || 'Poker Night', date: Date.now(), players: [], isActive: true, endedAt: null },
          ...state.games,
        ],
      };
    case 'DELETE_GAME':
      return { games: state.games.filter((g) => g.id !== action.gameId) };
    case 'END_GAME':
      return {
        games: state.games.map((g) =>
          g.id === action.gameId ? { ...g, isActive: false, endedAt: Date.now() } : g
        ),
      };
    case 'ADD_PLAYER': {
      const player: Player = { id: action.playerId, name: action.name.trim(), buyIns: [], cashOut: null };
      return {
        games: state.games.map((g) =>
          g.id === action.gameId ? { ...g, players: [...g.players, player] } : g
        ),
      };
    }
    case 'REMOVE_PLAYER':
      return {
        games: state.games.map((g) =>
          g.id === action.gameId ? { ...g, players: g.players.filter((p) => p.id !== action.playerId) } : g
        ),
      };
    case 'ADD_BUY_IN': {
      const buyIn: BuyIn = { id: action.buyInId, amount: action.amount, timestamp: Date.now() };
      return {
        games: state.games.map((g) =>
          g.id === action.gameId
            ? { ...g, players: g.players.map((p) => p.id === action.playerId ? { ...p, buyIns: [...p.buyIns, buyIn] } : p) }
            : g
        ),
      };
    }
    case 'SET_CASH_OUT':
      return {
        games: state.games.map((g) =>
          g.id === action.gameId
            ? { ...g, players: g.players.map((p) => p.id === action.playerId ? { ...p, cashOut: action.amount } : p) }
            : g
        ),
      };
    case 'CLEAR_CASH_OUT':
      return {
        games: state.games.map((g) =>
          g.id === action.gameId
            ? { ...g, players: g.players.map((p) => p.id === action.playerId ? { ...p, cashOut: null } : p) }
            : g
        ),
      };
    default:
      return state;
  }
}

interface GameStore {
  games: GameSession[];
  createGame: (name: string) => string;
  deleteGame: (gameId: string) => void;
  endGame: (gameId: string) => void;
  addPlayer: (gameId: string, name: string) => void;
  removePlayer: (gameId: string, playerId: string) => void;
  addBuyIn: (gameId: string, playerId: string, amount: number) => void;
  setCashOut: (gameId: string, playerId: string, amount: number) => void;
  clearCashOut: (gameId: string, playerId: string) => void;
}

const GameContext = createContext<GameStore | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { games: [] });

  const store: GameStore = {
    games: state.games,
    createGame: (name) => {
      const id = uid();
      dispatch({ type: 'CREATE_GAME', id, name });
      return id;
    },
    deleteGame: (gameId) => dispatch({ type: 'DELETE_GAME', gameId }),
    endGame: (gameId) => dispatch({ type: 'END_GAME', gameId }),
    addPlayer: (gameId, name) =>
      dispatch({ type: 'ADD_PLAYER', gameId, name, playerId: uid() }),
    removePlayer: (gameId, playerId) =>
      dispatch({ type: 'REMOVE_PLAYER', gameId, playerId }),
    addBuyIn: (gameId, playerId, amount) =>
      dispatch({ type: 'ADD_BUY_IN', gameId, playerId, amount, buyInId: uid() }),
    setCashOut: (gameId, playerId, amount) =>
      dispatch({ type: 'SET_CASH_OUT', gameId, playerId, amount }),
    clearCashOut: (gameId, playerId) =>
      dispatch({ type: 'CLEAR_CASH_OUT', gameId, playerId }),
  };

  return React.createElement(GameContext.Provider, { value: store }, children);
}

export function useGameStore(): GameStore {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGameStore must be used inside GameProvider');
  return ctx;
}
