import { Player, Settlement } from '../types';

export function playerTotalBuyIn(player: Player): number {
  return player.buyIns.reduce((sum, b) => sum + b.amount, 0);
}

export function playerNet(player: Player): number {
  return (player.cashOut ?? 0) - playerTotalBuyIn(player);
}

export function formatMoney(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = Number.isInteger(abs) ? abs.toFixed(0) : abs.toFixed(2);
  return `$${formatted}`;
}

export function formatNet(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = Number.isInteger(abs) ? abs.toFixed(0) : abs.toFixed(2);
  if (amount > 0.005) return `+$${formatted}`;
  if (amount < -0.005) return `-$${formatted}`;
  return `$0`;
}

export function calculateSettlement(players: Player[]): Settlement[] {
  const nets = players.map((p) => ({
    name: p.name,
    net: playerNet(p),
  }));

  const debtors = nets
    .filter((p) => p.net < -0.005)
    .map((p) => ({ name: p.name, amount: -p.net }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = nets
    .filter((p) => p.net > 0.005)
    .map((p) => ({ name: p.name, amount: p.net }))
    .sort((a, b) => b.amount - a.amount);

  const settlements: Settlement[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    if (pay > 0.005) {
      settlements.push({
        from: debtors[i].name,
        to: creditors[j].name,
        amount: Math.round(pay * 100) / 100,
      });
    }
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount < 0.005) i++;
    if (creditors[j].amount < 0.005) j++;
  }

  return settlements;
}

export function generateShareText(
  gameName: string,
  date: number,
  players: Player[],
  settlements: Settlement[]
): string {
  const dateStr = new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const lines: string[] = [
    `🃏 ${gameName}`,
    `📅 ${dateStr}`,
    '',
    '── RESULTS ──',
    ...players.map((p) => {
      const buyIn = playerTotalBuyIn(p);
      const cashOut = p.cashOut ?? 0;
      const net = playerNet(p);
      const netStr = formatNet(net);
      const arrow = net > 0 ? '▲' : net < 0 ? '▼' : '–';
      return `${arrow} ${p.name}: in ${formatMoney(buyIn)} / out ${formatMoney(cashOut)}  (${netStr})`;
    }),
  ];

  if (settlements.length > 0) {
    lines.push('', '── SETTLE UP ──');
    settlements.forEach((s) => {
      lines.push(`  ${s.from} → ${s.to}  ${formatMoney(s.amount)}`);
    });
  }

  const totalPot = players.reduce((sum, p) => sum + playerTotalBuyIn(p), 0);
  lines.push('', `Total pot: ${formatMoney(totalPot)}`);

  return lines.join('\n');
}
