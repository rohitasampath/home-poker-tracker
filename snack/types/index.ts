export interface BuyIn {
  id: string;
  amount: number;
  timestamp: number;
}

export interface Player {
  id: string;
  name: string;
  buyIns: BuyIn[];
  cashOut: number | null;
}

export interface GameSession {
  id: string;
  name: string;
  date: number;
  players: Player[];
  isActive: boolean;
  endedAt: number | null;
}

export interface Settlement {
  from: string;
  to: string;
  amount: number;
}
