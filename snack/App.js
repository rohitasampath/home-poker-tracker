import React, { useState, useCallback, useContext, useReducer, createContext, useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, Pressable, ScrollView, Share, SafeAreaView, Linking, Switch,
} from 'react-native';

// Graceful optional imports — present in standalone APK/IPA builds, absent in Expo Snack
let registerRootComponent, SafeAreaProvider, useSafeAreaInsets;
try { ({ registerRootComponent } = require('expo')); } catch {}
try { ({ SafeAreaProvider, useSafeAreaInsets } = require('react-native-safe-area-context')); } catch {}
try { require('react-native-screens').enableScreens(); } catch {}
try { require('@react-native-async-storage/async-storage'); } catch {}

// Fallbacks for Expo Snack (uses built-in AsyncStorage via global)
let AsyncStorage;
try { AsyncStorage = require('@react-native-async-storage/async-storage').default; } catch {}
if (!AsyncStorage) {
  // No-op shim so the app runs without persistence in Snack
  AsyncStorage = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
}

// SafeAreaProvider/useSafeAreaInsets fallbacks for Snack
if (!SafeAreaProvider) SafeAreaProvider = ({ children }) => children;
if (!useSafeAreaInsets) useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });

// ─── Theme ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#0a0a0a', surface: '#161616', surfaceAlt: '#1e1e1e', surfaceRaised: '#242424',
  border: '#2a2a2a', green: '#30d158', greenDim: '#1a7a35', red: '#ff453a',
  redDim: '#7a2020', gold: '#ffd60a', blue: '#0a84ff', blueDim: '#0a3d7a',
  text: '#ffffff', textSecondary: '#aeaeb2', textMuted: '#636366',
};

// ─── Utils ────────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function totalBuyIn(player) { return player.buyIns.reduce((s, b) => s + b.amount, 0); }
function playerNet(player) { return (player.cashOut ?? 0) - totalBuyIn(player); }
function fmt(n) { const a = Math.abs(n); return '$' + (Number.isInteger(a) ? a : a.toFixed(2)); }
function fmtNet(n) {
  const a = Math.abs(n), s = Number.isInteger(a) ? a : a.toFixed(2);
  return n > 0.005 ? `+$${s}` : n < -0.005 ? `-$${s}` : '$0';
}
function calcSettlements(players) {
  const nets = players.map(p => ({ name: p.name, net: playerNet(p) }));
  const debtors = nets.filter(p => p.net < -0.005).map(p => ({ name: p.name, amount: -p.net })).sort((a,b) => b.amount - a.amount);
  const creditors = nets.filter(p => p.net > 0.005).map(p => ({ name: p.name, amount: p.net })).sort((a,b) => b.amount - a.amount);
  const out = []; let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    if (pay > 0.005) out.push({ from: debtors[i].name, to: creditors[j].name, amount: Math.round(pay * 100) / 100 });
    debtors[i].amount -= pay; creditors[j].amount -= pay;
    if (debtors[i].amount < 0.005) i++;
    if (creditors[j].amount < 0.005) j++;
  }
  return out;
}
function shareText(game) {
  const date = new Date(game.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Column widths
  const names = game.players.map(p => p.name);
  const maxName = Math.max(6, ...names.map(n => n.length));
  const col = (str, width) => String(str).padEnd(width);
  const rcol = (str, width) => String(str).padStart(width);

  const header = `${'PLAYER'.padEnd(maxName)}  ${'BUY-IN'.padStart(7)}  ${'CASH-OUT'.padStart(8)}  ${'NET'.padStart(8)}`;
  const divider = '─'.repeat(header.length);

  const rows = game.players.map(p => {
    const bi = totalBuyIn(p), co = p.cashOut ?? 0, net = playerNet(p);
    const netStr = net > 0.005 ? `+${fmt(net)}` : net < -0.005 ? `-${fmt(Math.abs(net))}` : '$0';
    const trend = net > 0.005 ? '▲' : net < -0.005 ? '▼' : '–';
    return `${trend} ${col(p.name, maxName)}  ${rcol(fmt(bi), 7)}  ${rcol(p.cashOut !== null ? fmt(co) : '—', 8)}  ${rcol(netStr, 8)}`;
  });

  const pot = game.players.reduce((s, p) => s + totalBuyIn(p), 0);
  const tableAmt = game.tableAmount;
  const s = calcSettlements(game.players);

  const lines = [
    `🃏 ${game.name}`,
    `🗓  ${date}`,
    '',
    divider,
    `  ${header}`,
    divider,
    ...rows.map(r => `  ${r}`),
    divider,
    `  ${'Total Pot'.padEnd(maxName + 2)}  ${rcol(fmt(pot), 7)}`,
  ];
  if (tableAmt !== null && tableAmt > 0) {
    lines.push(`  ${'Table'.padEnd(maxName + 2)}  ${rcol(fmt(tableAmt), 7)}`);
  }
  if (s.length) {
    lines.push('', '── SETTLE UP ──');
    s.forEach(x => lines.push(`  ${x.from} → ${x.to}   ${fmt(x.amount)}`));
  }
  return lines.join('\n');
}

const SPADES = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const RANK_ORDER = { A: 12, K: 11, Q: 10, J: 9, '10': 8, '9': 7, '8': 6, '7': 5, '6': 4, '5': 3, '4': 2, '3': 1, '2': 0 };

function debtKey(gameId, from, to) { return `${gameId}|${from}|${to}`; }

function getPlayerStats(games) {
  const map = {};
  [...games].sort((a, b) => a.date - b.date).forEach(game => {
    game.players.forEach(p => {
      if (!map[p.name]) map[p.name] = { name: p.name, sessions: [] };
      if (totalBuyIn(p) > 0 || p.cashOut !== null) {
        map[p.name].sessions.push({
          gameName: game.name,
          date: game.date,
          net: playerNet(p),
          buyIn: totalBuyIn(p),
          cashOut: p.cashOut ?? 0,
        });
      }
    });
  });
  return Object.values(map)
    .filter(ps => ps.sessions.length > 0)
    .sort((a, b) => {
      const tA = a.sessions.reduce((s, x) => s + x.net, 0);
      const tB = b.sessions.reduce((s, x) => s + x.net, 0);
      return tB - tA;
    });
}

// ─── Store (React Context) ────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case 'CREATE': return { ...state, games: [{ id: action.id, name: action.name.trim() || 'Poker Night', date: Date.now(), players: [], tableAmount: null, isActive: true, endedAt: null }, ...state.games] };
    case 'DELETE': return { ...state, games: state.games.filter(g => g.id !== action.id) };
    case 'END': return { ...state, games: state.games.map(g => g.id === action.id ? { ...g, isActive: false, endedAt: Date.now() } : g) };
    case 'SET_TABLE': return { ...state, games: state.games.map(g => g.id === action.id ? { ...g, tableAmount: action.amount } : g) };
    case 'CLR_TABLE': return { ...state, games: state.games.map(g => g.id === action.id ? { ...g, tableAmount: null } : g) };
    case 'ADD_PLAYER': {
      const p = { id: action.pid, name: action.name.trim(), buyIns: [], cashOut: null };
      return { ...state, games: state.games.map(g => g.id === action.id ? { ...g, players: [...g.players, p] } : g) };
    }
    case 'DEL_PLAYER': return { ...state, games: state.games.map(g => g.id === action.id ? { ...g, players: g.players.filter(p => p.id !== action.pid) } : g) };
    case 'BUY_IN': {
      const b = { id: action.bid, amount: action.amount, timestamp: Date.now() };
      return { ...state, games: state.games.map(g => g.id === action.id ? { ...g, players: g.players.map(p => p.id === action.pid ? { ...p, buyIns: [...p.buyIns, b] } : p) } : g) };
    }
    case 'CASH_OUT': return { ...state, games: state.games.map(g => g.id === action.id ? { ...g, players: g.players.map(p => p.id === action.pid ? { ...p, cashOut: action.amount } : p) } : g) };
    case 'CLR_CASH': return { ...state, games: state.games.map(g => g.id === action.id ? { ...g, players: g.players.map(p => p.id === action.pid ? { ...p, cashOut: null } : p) } : g) };
    case 'ROSTER_ADD': {
      if (state.roster.some(r => r.name.toLowerCase() === action.name.trim().toLowerCase())) return state;
      return { ...state, roster: [...state.roster, { id: action.rid, name: action.name.trim(), phone: action.phone || '' }] };
    }
    case 'ROSTER_DEL': return { ...state, roster: state.roster.filter(r => r.id !== action.rid) };
    case 'ROSTER_SET_PHONE': return { ...state, roster: state.roster.map(r => r.id === action.rid ? { ...r, phone: action.phone.trim() } : r) };
    case 'SETTLE': return { ...state, settled: { ...state.settled, [action.key]: true } };
    case 'UNSETTLE': {
      const { [action.key]: _removed, ...rest } = state.settled;
      return { ...state, settled: rest };
    }
    case 'LOCK':   return { ...state, isLocked: true };
    case 'UNLOCK': return { ...state, isLocked: false };
    case 'HYDRATE': return { ...state, ...action.payload, isLocked: action.payload.isLocked ?? false };
    default: return state;
  }
}
const Ctx = createContext(null);
const STORAGE_KEY = '@poker_tracker_v1';
function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, { games: [], roster: [], settled: {}, isLocked: false });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(json => {
      if (json) {
        try {
          const saved = JSON.parse(json);
          dispatch({ type: 'HYDRATE', payload: saved });
        } catch {}
      }
    }).finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      games: state.games,
      roster: state.roster,
      settled: state.settled,
      isLocked: state.isLocked,
    })).catch(() => {});
  }, [state, hydrated]);

  if (!hydrated) return null;

  const store = {
    games: state.games,
    roster: state.roster,
    settled: state.settled,
    isLocked: state.isLocked,
    createGame: name => { const id = uid(); dispatch({ type: 'CREATE', id, name }); return id; },
    deleteGame: id => dispatch({ type: 'DELETE', id }),
    endGame: id => dispatch({ type: 'END', id }),
    addPlayer: (id, name) => dispatch({ type: 'ADD_PLAYER', id, name, pid: uid() }),
    removePlayer: (id, pid) => dispatch({ type: 'DEL_PLAYER', id, pid }),
    addBuyIn: (id, pid, amount) => dispatch({ type: 'BUY_IN', id, pid, amount, bid: uid() }),
    setCashOut: (id, pid, amount) => dispatch({ type: 'CASH_OUT', id, pid, amount }),
    clearCashOut: (id, pid) => dispatch({ type: 'CLR_CASH', id, pid }),
    addToRoster: (name, phone) => dispatch({ type: 'ROSTER_ADD', name, phone, rid: uid() }),
    removeFromRoster: rid => dispatch({ type: 'ROSTER_DEL', rid }),
    setRosterPhone: (rid, phone) => dispatch({ type: 'ROSTER_SET_PHONE', rid, phone }),
    settleDebt: key => dispatch({ type: 'SETTLE', key }),
    unsettleDebt: key => dispatch({ type: 'UNSETTLE', key }),
    lockApp: () => dispatch({ type: 'LOCK' }),
    unlockApp: () => dispatch({ type: 'UNLOCK' }),
    setTableAmount: (id, amount) => dispatch({ type: 'SET_TABLE', id, amount }),
    clearTableAmount: id => dispatch({ type: 'CLR_TABLE', id }),
  };
  return React.createElement(Ctx.Provider, { value: store }, children);
}
function useStore() { return useContext(Ctx); }

// ─── Modals ───────────────────────────────────────────────────────────────────
function AddPlayerModal({ visible, onClose, onAdd, roster = [], existingNames = [], cashedOutNames = [], onAddToRoster }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [saveToRoster, setSaveToRoster] = useState(false);

  React.useEffect(() => {
    if (visible) { setName(''); setSelected(new Set()); setSaveToRoster(false); }
  }, [visible]);

  const available = roster.filter(r => !existingNames.includes(r.name));

  const toggleSelect = rid => setSelected(prev => {
    const next = new Set(prev);
    next.has(rid) ? next.delete(rid) : next.add(rid);
    return next;
  });

  const handleSubmit = () => {
    available.filter(r => selected.has(r.id)).forEach(r => onAdd(r.name));
    if (name.trim()) {
      onAdd(name.trim());
      if (saveToRoster && onAddToRoster) onAddToRoster(name.trim());
    }
    onClose();
  };

  const totalAdding = selected.size + (name.trim() ? 1 : 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={apm.overlay} onPress={onClose}>
        <Pressable style={apm.sheet} onPress={() => {}}>
          <Text style={apm.title}>Add Players</Text>

          {available.length > 0 && (
            <>
              <Text style={apm.sectionLabel}>From Roster</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {available.map(r => {
                  const sel = selected.has(r.id);
                  return (
                    <TouchableOpacity key={r.id} activeOpacity={0.7}
                      style={[apm.chip, sel && apm.chipSelected]}
                      onPress={() => toggleSelect(r.id)}>
                      <Text style={[apm.chipTxt, sel && apm.chipTxtSelected]}>
                        {sel ? '✓  ' : ''}{r.name}
                        {cashedOutNames.includes(r.name) ? (
                          <Text style={{ fontSize: 10, color: sel ? '#000' : C.gold }}>{' '}↩ Re-join</Text>
                        ) : null}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          <Text style={apm.sectionLabel}>{available.length > 0 ? 'Or Add New' : 'New Player'}</Text>
          <TextInput style={ms.input} placeholder="Type a name…" placeholderTextColor={C.textMuted}
            value={name} onChangeText={setName} maxLength={30} returnKeyType="done" onSubmitEditing={handleSubmit} />

          {name.trim().length > 0 && (
            <TouchableOpacity style={apm.checkRow} onPress={() => setSaveToRoster(v => !v)}>
              <View style={[apm.checkbox, saveToRoster && apm.checkboxOn]}>
                {saveToRoster && <Text style={apm.checkmark}>✓</Text>}
              </View>
              <Text style={apm.checkLabel}>Save to roster</Text>
            </TouchableOpacity>
          )}

          <View style={[ms.row, { marginTop: name.trim() ? 0 : 0 }]}>
            <TouchableOpacity style={[ms.btn, ms.cancel]} onPress={onClose}>
              <Text style={ms.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ms.btn, ms.confirm, totalAdding === 0 && ms.disabled]}
              onPress={handleSubmit} disabled={totalAdding === 0}>
              <Text style={ms.confirmTxt}>
                {totalAdding > 1 ? `Add ${totalAdding} Players` : 'Add Player'}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const apm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surfaceAlt, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 44,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.border,
  },
  title: { color: C.text, fontSize: 20, fontWeight: '800', marginBottom: 16 },
  sectionLabel: { color: C.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
  chip: { backgroundColor: C.surfaceRaised, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: C.border },
  chipSelected: { backgroundColor: C.blue, borderColor: C.blue },
  chipTxt: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
  chipTxtSelected: { color: '#fff' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -8, marginBottom: 16 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: C.blue, borderColor: C.blue },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '900', lineHeight: 14 },
  checkLabel: { color: C.textSecondary, fontSize: 13 },
});

const QUICK = [20, 50, 100, 200];
function BuyInModal({ visible, playerName, onClose, onAdd }) {
  const [raw, setRaw] = useState('');
  const amt = parseFloat(raw), ok = !isNaN(amt) && amt > 0;
  const submit = () => { if (!ok) return; onAdd(amt); setRaw(''); };
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={ms.overlay} onPress={() => { setRaw(''); onClose(); }}>
        <Pressable style={ms.box} onPress={() => {}}>
          <Text style={ms.title}>Buy In</Text>
          <Text style={ms.sub}>{playerName}</Text>
          <View style={ms.quickRow}>
            {QUICK.map(v => (
              <TouchableOpacity key={v} style={ms.quickBtn} onPress={() => { onAdd(v); setRaw(''); }}>
                <Text style={ms.quickTxt}>${v}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={ms.inputRow}>
            <Text style={ms.dollar}>$</Text>
            <TextInput style={ms.bigInput} placeholder="Custom" placeholderTextColor={C.textMuted}
              value={raw} onChangeText={setRaw} keyboardType="decimal-pad" returnKeyType="done" onSubmitEditing={submit} />
          </View>
          <View style={ms.row}>
            <TouchableOpacity style={[ms.btn, ms.cancel]} onPress={() => { setRaw(''); onClose(); }}>
              <Text style={ms.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ms.btn, { backgroundColor: C.green }, !ok && ms.disabled]} onPress={submit} disabled={!ok}>
              <Text style={[ms.confirmTxt, { color: '#000' }]}>{ok ? `Add ${fmt(amt)}` : 'Add'}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const DENOMINATIONS = [
  { label: '25¢',  value: 0.25, bg: '#9e9e9e', ring: 'rgba(255,255,255,0.35)' },
  { label: '50¢',  value: 0.50, bg: '#64b5f6', ring: 'rgba(255,255,255,0.35)' },
  { label: '$1',   value: 1,    bg: '#eeeeee', ring: 'rgba(0,0,0,0.2)' },
  { label: '$5',   value: 5,    bg: '#ef5350', ring: 'rgba(255,255,255,0.35)' },
  { label: '$10',  value: 10,   bg: '#1e88e5', ring: 'rgba(255,255,255,0.35)' },
  { label: '$50',  value: 50,   bg: '#43a047', ring: 'rgba(255,255,255,0.35)' },
  { label: '$100', value: 100,  bg: '#212121', ring: 'rgba(255,255,255,0.25)' },
];

function chipSubtotal(d, counts) {
  const n = Math.max(0, parseInt(counts[d.label] || '0', 10) || 0);
  return Math.round(n * d.value * 100) / 100;
}

function CashOutModal({ visible, playerName, currentAmount, onClose, onSave, onClear }) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Height available inside the sheet for the scrollable chip list.
  // 90% of screen, minus bottom inset, minus all fixed UI elements (~260px: title+sub+tabs+buttons+padding).
  const chipScrollH = Math.max(160, screenH * 0.9 - insets.bottom - 260);

  const [mode, setMode] = useState('manual');
  const [raw, setRaw] = useState('');
  const [counts, setCounts] = useState({});

  React.useEffect(() => {
    if (visible) {
      setMode('manual');
      setRaw(currentAmount !== null ? String(currentAmount) : '');
      setCounts({});
    }
  }, [visible, currentAmount]);

  const manualAmt = parseFloat(raw);
  const manualOk  = !isNaN(manualAmt) && manualAmt >= 0;

  const chipTotal = DENOMINATIONS.reduce((s, d) => Math.round((s + chipSubtotal(d, counts)) * 100) / 100, 0);
  const chipOk    = chipTotal > 0;

  const finalAmt = mode === 'manual' ? manualAmt : chipTotal;
  const canSave  = mode === 'manual' ? manualOk  : chipOk;

  const submit = () => { if (!canSave) return; onSave(finalAmt); };

  const adjust = (label, delta) => {
    setCounts(prev => {
      const cur = Math.max(0, parseInt(prev[label] || '0', 10) || 0);
      return { ...prev, [label]: String(Math.max(0, cur + delta)) };
    });
  };

  const tabStyle = (key) => ({
    flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center',
    backgroundColor: mode === key ? C.surface : 'transparent',
    borderWidth: mode === key ? 1 : 0, borderColor: C.border,
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={co.overlay} onPress={onClose}>
        <Pressable style={[co.sheet, { paddingBottom: Math.max(24, insets.bottom + 16) }]} onPress={() => {}}>
          <Text style={ms.title}>Cash Out</Text>
          <Text style={[ms.sub, { marginBottom: 14 }]}>{playerName}</Text>

          {/* Mode toggle */}
          <View style={co.tabBar}>
            <TouchableOpacity style={tabStyle('manual')} onPress={() => setMode('manual')} activeOpacity={0.8}>
              <Text style={{ color: mode === 'manual' ? C.text : C.textMuted, fontSize: 13, fontWeight: '700' }}>✏️  Manual</Text>
            </TouchableOpacity>
            <TouchableOpacity style={tabStyle('chips')} onPress={() => setMode('chips')} activeOpacity={0.8}>
              <Text style={{ color: mode === 'chips' ? C.gold : C.textMuted, fontSize: 13, fontWeight: '700' }}>🪙  Count Chips</Text>
            </TouchableOpacity>
          </View>

          {mode === 'manual' ? (
            <View style={[ms.inputRow, { borderColor: C.gold, marginBottom: 20 }]}>
              <Text style={[ms.dollar, { color: C.gold, fontSize: 22 }]}>$</Text>
              <TextInput style={[ms.bigInput, { fontSize: 26, fontWeight: '700' }]}
                placeholder="0" placeholderTextColor={C.textMuted}
                value={raw} onChangeText={setRaw} keyboardType="decimal-pad"
                autoFocus returnKeyType="done" onSubmitEditing={submit} />
            </View>
          ) : (
            <ScrollView style={{ maxHeight: chipScrollH }} showsVerticalScrollIndicator={true}
              nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {DENOMINATIONS.map(d => {
                const count = Math.max(0, parseInt(counts[d.label] || '0', 10) || 0);
                const sub   = chipSubtotal(d, counts);
                const subFmt = sub === 0 ? '—' : sub < 1 ? `${(sub * 100).toFixed(0)}¢` : `$${Number.isInteger(sub) ? sub : sub.toFixed(2)}`;
                const txtColor = sub > 0 ? C.gold : C.textMuted;
                return (
                  <View key={d.label} style={co.denomRow}>
                    {/* Poker chip visual */}
                    <View style={[co.chip, { backgroundColor: d.bg }]}>
                      <View style={[co.chipRing, { borderColor: d.ring }]} />
                    </View>

                    <Text style={co.denomLabel}>{d.label}</Text>

                    {/* Stepper */}
                    <TouchableOpacity onPress={() => adjust(d.label, -1)} style={co.stepBtn} activeOpacity={0.6}>
                      <Text style={[co.stepTxt, { color: count > 0 ? C.blue : C.textMuted }]}>−</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={co.countInput}
                      value={String(count)}
                      onChangeText={v => setCounts(p => ({ ...p, [d.label]: v.replace(/\D/g, '').slice(0, 4) }))}
                      keyboardType="number-pad" maxLength={4} selectTextOnFocus />
                    <TouchableOpacity onPress={() => adjust(d.label, 1)} style={co.stepBtn} activeOpacity={0.6}>
                      <Text style={[co.stepTxt, { color: C.blue }]}>+</Text>
                    </TouchableOpacity>

                    {/* Subtotal */}
                    <Text style={[co.subTotal, { color: txtColor }]}>{subFmt}</Text>
                  </View>
                );
              })}

              {/* Grand total row */}
              <View style={co.totalRow}>
                <Text style={co.totalLabel}>TOTAL</Text>
                <Text style={[co.totalAmt, { color: chipOk ? C.gold : C.textMuted }]}>
                  {chipOk ? `$${Number.isInteger(chipTotal) ? chipTotal : chipTotal.toFixed(2)}` : '$0'}
                </Text>
              </View>
            </ScrollView>
          )}

          <View style={[ms.row, { marginTop: 16 }]}>
            <TouchableOpacity style={[ms.btn, ms.cancel]} onPress={onClose}>
              <Text style={ms.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            {currentAmount !== null && (
              <TouchableOpacity style={[ms.btn, { backgroundColor: C.redDim, borderWidth: 1, borderColor: C.red }]}
                onPress={() => { onClear(); }}>
                <Text style={{ color: C.red, fontSize: 15, fontWeight: '600' }}>Clear</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[ms.btn, { backgroundColor: C.gold }, !canSave && ms.disabled]}
              onPress={submit} disabled={!canSave}>
              <Text style={[ms.confirmTxt, { color: '#000' }]}>
                {canSave ? `Cash Out  ${ Number.isInteger(finalAmt) ? finalAmt : finalAmt.toFixed(2) }` : 'Cash Out'}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const co = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surfaceAlt, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 44,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.border,
    maxHeight: '90%', flexShrink: 1,
  },
  tabBar: { flexDirection: 'row', backgroundColor: C.surfaceRaised, borderRadius: 12, padding: 3, marginBottom: 18, borderWidth: 1, borderColor: C.border },
  denomRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border },
  chip: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 10, flexShrink: 0 },
  chipRing: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  denomLabel: { color: C.text, fontSize: 15, fontWeight: '700', width: 42 },
  stepBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  stepTxt: { fontSize: 22, fontWeight: '700', lineHeight: 26 },
  countInput: {
    backgroundColor: C.surfaceRaised, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 4,
    color: C.text, fontSize: 16, fontWeight: '700', width: 52, textAlign: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  subTotal: { fontSize: 14, fontWeight: '700', minWidth: 52, textAlign: 'right', marginLeft: 'auto' },
  totalRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 14, paddingBottom: 4 },
  totalLabel: { flex: 1, color: C.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  totalAmt: { fontSize: 26, fontWeight: '900' },
});

// ─── Host PIN Modal ───────────────────────────────────────────────────────────
const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  box: { backgroundColor: C.surfaceAlt, borderRadius: 20, padding: 24, width: '100%', borderWidth: 1, borderColor: C.border },
  title: { color: C.text, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  sub: { color: C.textMuted, fontSize: 14, marginBottom: 16 },
  input: { backgroundColor: C.surfaceRaised, borderRadius: 12, padding: 14, color: C.text, fontSize: 16, borderWidth: 1, borderColor: C.border, marginBottom: 20 },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  quickBtn: { flex: 1, backgroundColor: C.surfaceRaised, borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  quickTxt: { color: C.text, fontSize: 15, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceRaised, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, marginBottom: 20 },
  dollar: { color: C.textSecondary, fontSize: 18, fontWeight: '700', marginRight: 4 },
  bigInput: { flex: 1, padding: 14, paddingLeft: 0, color: C.text, fontSize: 20, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancel: { backgroundColor: C.surfaceRaised, borderWidth: 1, borderColor: C.border },
  cancelTxt: { color: C.textSecondary, fontSize: 15, fontWeight: '600' },
  confirm: { backgroundColor: C.blue },
  confirmTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.4 },
});

// ─── Draw Seats Modal ─────────────────────────────────────────────────────────
function DrawSeatsModal({ visible, players, onClose }) {
  const [assignments, setAssignments] = useState([]);

  const draw = useCallback(() => {
    if (!players.length) return;
    const shuffled = [...SPADES].sort(() => Math.random() - 0.5);
    const result = players
      .map((p, i) => ({ name: p.name, rank: shuffled[i % SPADES.length] }))
      .sort((a, b) => RANK_ORDER[b.rank] - RANK_ORDER[a.rank]);
    setAssignments(result);
  }, [players]);

  React.useEffect(() => { if (visible) draw(); }, [visible]);

  const ordinal = i => ['1st', '2nd', '3rd'][i] || `${i + 1}th`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={dss.overlay} onPress={onClose}>
        <Pressable style={dss.sheet} onPress={() => {}}>
          <Text style={dss.title}>♠  Seat Draw</Text>
          <Text style={dss.sub}>
            {players.length < 2
              ? 'Add at least 2 players to draw seats'
              : 'Higher card picks their seat first'}
          </Text>

          {players.length >= 2 ? (
            <>
              {assignments.map((a, i) => (
                <View key={a.name} style={dss.row}>
                  <Text style={dss.order}>{ordinal(i)}</Text>
                  <Text style={dss.playerName}>{a.name}</Text>
                  <View style={dss.card}>
                    <Text style={dss.cardRank}>{a.rank}</Text>
                    <Text style={dss.cardSuit}>♠</Text>
                  </View>
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
                <TouchableOpacity style={[ms.btn, ms.cancel, { flex: 1 }]} onPress={draw}>
                  <Text style={ms.cancelTxt}>↺  Re-draw</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[ms.btn, { flex: 1, backgroundColor: C.blue }]} onPress={onClose}>
                  <Text style={ms.confirmTxt}>Done</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <TouchableOpacity style={[ms.btn, { backgroundColor: C.blue, marginTop: 4 }]} onPress={onClose}>
              <Text style={ms.confirmTxt}>OK</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const dss = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surfaceAlt, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 44,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.border,
  },
  title: { color: C.text, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  sub: { color: C.textMuted, fontSize: 14, marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  order: { color: C.textMuted, fontSize: 13, fontWeight: '700', width: 44 },
  playerName: { flex: 1, color: C.text, fontSize: 16, fontWeight: '600' },
  card: {
    backgroundColor: '#ffffff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    alignItems: 'center', minWidth: 52, borderWidth: 1, borderColor: '#d0d0d0',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardRank: { color: '#111827', fontSize: 18, fontWeight: '900', lineHeight: 22 },
  cardSuit: { color: '#111827', fontSize: 13, lineHeight: 15 },
});

// ─── Roster Modal ─────────────────────────────────────────────────────────────
function RosterModal({ visible, roster, onClose, onAdd, onRemove, onSetPhone }) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Height for the player list scroll area.
  // 90% of screen, minus bottom inset, minus all fixed UI (~320px: title+sub+inputs+addBtn+doneBtn+padding).
  const listScrollH = Math.max(120, screenH * 0.9 - insets.bottom - 320);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editPhone, setEditPhone] = useState('');

  React.useEffect(() => {
    if (!visible) { setEditingId(null); setEditPhone(''); }
  }, [visible]);

  const submit = () => {
    if (!name.trim()) return;
    onAdd(name.trim(), phone.trim());
    setName(''); setPhone('');
  };

  const startEditPhone = (r) => {
    setEditingId(r.id);
    setEditPhone(r.phone || '');
  };

  const savePhone = (rid) => {
    onSetPhone(rid, editPhone);
    setEditingId(null);
    setEditPhone('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={dss.overlay} onPress={onClose}>
        <Pressable style={[rm.sheet, { paddingBottom: Math.max(24, insets.bottom + 16) }]} onPress={() => {}}>
          <Text style={rm.title}>Player Roster</Text>
          <Text style={rm.sub}>Saved players — add phone numbers to get buy-in SMS alerts</Text>

          <ScrollView style={{ maxHeight: listScrollH }} showsVerticalScrollIndicator={false}
            nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {roster.length === 0 ? (
              <View style={rm.emptyBox}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>👤</Text>
                <Text style={rm.emptyTxt}>No players saved yet</Text>
                <Text style={rm.emptySub}>Add names below to build your regular group</Text>
              </View>
            ) : (
              roster.map(r => (
                <View key={r.id} style={rm.row}>
                  <View style={rm.avatar}>
                    <Text style={rm.avatarTxt}>{r.name[0].toUpperCase()}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={rm.playerName}>{r.name}</Text>
                    {editingId === r.id ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <TextInput
                          style={rm.phoneInput}
                          placeholder="Phone number"
                          placeholderTextColor={C.textMuted}
                          value={editPhone}
                          onChangeText={setEditPhone}
                          keyboardType="phone-pad"
                          maxLength={20}
                          autoFocus
                          returnKeyType="done"
                          onSubmitEditing={() => savePhone(r.id)}
                        />
                        <TouchableOpacity style={rm.savePhoneBtn} onPress={() => savePhone(r.id)}>
                          <Text style={rm.saveProneBtnTxt}>Save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setEditingId(null)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={{ color: C.textMuted, fontSize: 13 }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => startEditPhone(r)} activeOpacity={0.6}>
                        <Text style={r.phone ? rm.phoneSet : rm.phoneEmpty}>
                          {r.phone ? `📱 ${r.phone}` : '📱 Add phone number'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <TouchableOpacity onPress={() => onRemove(r.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: 8 }}>
                    <Text style={{ color: C.textMuted, fontSize: 16 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>

          {/* Add new player */}
          <View style={{ marginTop: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput style={[rm.input, { flex: 1.4 }]} placeholder="Name" placeholderTextColor={C.textMuted}
                value={name} onChangeText={setName} maxLength={30} returnKeyType="next" />
              <TextInput style={[rm.input, { flex: 1 }]} placeholder="Phone (optional)" placeholderTextColor={C.textMuted}
                value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} returnKeyType="done"
                onSubmitEditing={submit} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[rm.addBtn, { flex: 1 }, !name.trim() && ms.disabled]} onPress={submit} disabled={!name.trim()}>
                <Text style={rm.addBtnTxt}>+ Add Player</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ms.btn, { flex: 1, backgroundColor: C.blue, marginTop: 0 }]} onPress={onClose}>
                <Text style={ms.confirmTxt}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const rm = StyleSheet.create({
  sheet: {
    backgroundColor: C.surfaceAlt, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 44,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.border,
    maxHeight: '90%', flexShrink: 1,
  },
  title: { color: C.text, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  sub: { color: C.textMuted, fontSize: 14, marginBottom: 20 },
  emptyBox: { alignItems: 'center', paddingVertical: 24 },
  emptyTxt: { color: C.textSecondary, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  emptySub: { color: C.textMuted, fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.blueDim, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarTxt: { color: C.blue, fontSize: 13, fontWeight: '800' },
  playerName: { color: C.text, fontSize: 16, fontWeight: '600' },
  phoneSet: { color: C.blue, fontSize: 12, marginTop: 2 },
  phoneEmpty: { color: C.textMuted, fontSize: 12, marginTop: 2 },
  phoneInput: { flex: 1, backgroundColor: C.surfaceRaised, borderRadius: 8, padding: 8, color: C.text, fontSize: 13, borderWidth: 1, borderColor: C.blue },
  savePhoneBtn: { backgroundColor: C.blue, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10 },
  saveProneBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  addRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 20 },
  input: { backgroundColor: C.surfaceRaised, borderRadius: 12, padding: 13, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.border },
  addBtn: { backgroundColor: C.blue, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  addBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

// ─── Player Stats Modal ───────────────────────────────────────────────────────
function PlayerStatsModal({ visible, games, onClose }) {
  const stats = getPlayerStats(games);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={pss.root}>
        <View style={pss.header}>
          <Text style={pss.title}>📊 Player Stats</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
            <Text style={{ color: C.blue, fontSize: 16, fontWeight: '700' }}>Done</Text>
          </TouchableOpacity>
        </View>

        {stats.length === 0 ? (
          <View style={pss.empty}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>📊</Text>
            <Text style={pss.emptyTxt}>No game history yet</Text>
            <Text style={pss.emptySub}>Stats appear after players finish games</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {stats.map(ps => {
              const totalNet = ps.sessions.reduce((s, x) => s + x.net, 0);
              const maxAbs = Math.max(...ps.sessions.map(s => Math.abs(s.net)), 1);
              const wins = ps.sessions.filter(s => s.net > 0.005).length;
              const losses = ps.sessions.filter(s => s.net < -0.005).length;
              const initials = ps.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
              const tBuyIn = ps.sessions.reduce((s, x) => s + x.buyIn, 0);
              const tCashOut = ps.sessions.reduce((s, x) => s + x.cashOut, 0);
              const avgNet = totalNet / ps.sessions.length;
              return (
                <View key={ps.name} style={pss.card}>
                  {/* Player summary header */}
                  <View style={pss.cardTop}>
                    <View style={pss.avatar}><Text style={pss.avatarTxt}>{initials}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={pss.playerName}>{ps.name}</Text>
                      <Text style={pss.playerSub}>
                        {ps.sessions.length} session{ps.sessions.length !== 1 ? 's' : ''} · {wins}W  {losses}L
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[pss.totalNet, { color: totalNet >= 0 ? C.green : C.red }]}>{fmtNet(totalNet)}</Text>
                      <Text style={pss.totalNetLabel}>all-time net</Text>
                    </View>
                  </View>

                  {/* Summary chips */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 16 }}>
                    {[
                      { label: 'Total In', value: fmt(tBuyIn) },
                      { label: 'Total Out', value: fmt(tCashOut) },
                      { label: 'Avg / Game', value: fmtNet(avgNet) },
                    ].map(chip => (
                      <View key={chip.label} style={pss.chip}>
                        <Text style={pss.chipLabel}>{chip.label}</Text>
                        <Text style={pss.chipValue}>{chip.value}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Session bar chart */}
                  <Text style={pss.chartLabel}>Session History</Text>
                  {ps.sessions.map((session, i) => {
                    const fillW = Math.max(6, (Math.abs(session.net) / maxAbs) * 130);
                    const barColor = session.net > 0.005 ? C.green : session.net < -0.005 ? C.red : C.textMuted;
                    const date = new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    return (
                      <View key={i} style={pss.sessionRow}>
                        <View style={pss.sessionLeft}>
                          <Text style={pss.sessionName} numberOfLines={1}>{session.gameName}</Text>
                          <Text style={pss.sessionMeta}>{date} · in {fmt(session.buyIn)}</Text>
                        </View>
                        <View style={pss.barArea}>
                          <View style={pss.barTrack}>
                            <View style={[pss.barFill, { width: fillW, backgroundColor: barColor }]} />
                          </View>
                        </View>
                        <Text style={[pss.sessionNet, { color: barColor }]}>{fmtNet(session.net)}</Text>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const pss = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
  title: { flex: 1, color: C.text, fontSize: 20, fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  emptyTxt: { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySub: { color: C.textMuted, fontSize: 14 },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.blueDim, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarTxt: { color: C.blue, fontSize: 15, fontWeight: '800' },
  playerName: { color: C.text, fontSize: 17, fontWeight: '700' },
  playerSub: { color: C.textMuted, fontSize: 12, marginTop: 2 },
  totalNet: { fontSize: 22, fontWeight: '800' },
  totalNetLabel: { color: C.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'right', marginTop: 2 },
  chip: { flex: 1, backgroundColor: C.surfaceRaised, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  chipLabel: { color: C.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 3 },
  chipValue: { color: C.textSecondary, fontSize: 13, fontWeight: '700' },
  chartLabel: { color: C.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border },
  sessionLeft: { width: 90 },
  sessionName: { color: C.textSecondary, fontSize: 11, fontWeight: '600' },
  sessionMeta: { color: C.textMuted, fontSize: 10, marginTop: 1 },
  barArea: { flex: 1, paddingHorizontal: 8 },
  barTrack: { height: 10, backgroundColor: C.surfaceRaised, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5 },
  sessionNet: { fontSize: 13, fontWeight: '700', width: 58, textAlign: 'right' },
});

// ─── Debts Modal ──────────────────────────────────────────────────────────────
function DebtsModal({ visible, games, settled, onClose, onSettle, onUnsettle }) {
  const [showSettled, setShowSettled] = useState(false);

  const allDebts = [];
  games.filter(g => !g.isActive).forEach(game => {
    calcSettlements(game.players).forEach(s => {
      const key = debtKey(game.id, s.from, s.to);
      allDebts.push({
        key, gameName: game.name, gameDate: game.date,
        from: s.from, to: s.to, amount: s.amount,
        isPaid: !!settled[key],
      });
    });
  });

  const unpaid = allDebts.filter(d => !d.isPaid);
  const paid = allDebts.filter(d => d.isPaid);

  const handleShare = useCallback(async () => {
    if (allDebts.length === 0) return;
    const byGame = {};
    unpaid.forEach(d => {
      if (!byGame[d.gameName]) byGame[d.gameName] = { date: d.gameDate, debts: [] };
      byGame[d.gameName].debts.push(d);
    });
    const lines = ['💰 Settle Up Summary', ''];
    if (unpaid.length === 0) {
      lines.push('✅ All debts have been settled!');
    } else {
      lines.push(`${unpaid.length} outstanding debt${unpaid.length !== 1 ? 's' : ''}`, '');
      Object.entries(byGame).forEach(([gameName, { date, debts }]) => {
        const d = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        lines.push(`── ${gameName} (${d}) ──`);
        debts.forEach(debt => lines.push(`  ${debt.from} owes ${debt.to}  ${fmt(debt.amount)}`));
        lines.push('');
      });
      const total = unpaid.reduce((s, d) => s + d.amount, 0);
      lines.push(`Total outstanding: ${fmt(total)}`);
    }
    if (paid.length > 0) {
      lines.push('', `✓ ${paid.length} debt${paid.length !== 1 ? 's' : ''} already settled`);
    }
    try { await Share.share({ message: lines.join('\n') }); } catch {}
  }, [allDebts, unpaid, paid]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={dbt.root}>
        <View style={dbt.header}>
          <Text style={dbt.title}>💰 Settle Up</Text>
          {unpaid.length > 0 && (
            <View style={dbt.badge}><Text style={dbt.badgeTxt}>{unpaid.length}</Text></View>
          )}
          <View style={{ flex: 1 }} />
          {allDebts.length > 0 && (
            <TouchableOpacity onPress={handleShare} style={dbt.shareBtn} activeOpacity={0.75}>
              <Text style={dbt.shareBtnTxt}>📤  Share</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onClose} style={{ padding: 8, marginLeft: 8 }}>
            <Text style={{ color: C.blue, fontSize: 16, fontWeight: '700' }}>Done</Text>
          </TouchableOpacity>
        </View>

        {allDebts.length === 0 ? (
          <View style={dbt.empty}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>💸</Text>
            <Text style={dbt.emptyTxt}>No debts yet</Text>
            <Text style={dbt.emptySub}>Debts appear here once a game ends with outstanding balances</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {unpaid.length === 0 && (
              <View style={dbt.allClear}>
                <Text style={{ fontSize: 40, marginBottom: 8 }}>🎉</Text>
                <Text style={dbt.allClearTxt}>All settled!</Text>
                <Text style={dbt.allClearSub}>No outstanding debts</Text>
              </View>
            )}

            {unpaid.length > 0 && (
              <>
                <Text style={dbt.sectionLabel}>Outstanding ({unpaid.length})</Text>
                {unpaid.map(debt => (
                  <View key={debt.key} style={dbt.debtCard}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                        <Text style={dbt.fromName}>{debt.from}</Text>
                        <Text style={dbt.arrow}>owes</Text>
                        <Text style={dbt.toName}>{debt.to}</Text>
                        <Text style={dbt.amount}>{fmt(debt.amount)}</Text>
                      </View>
                      <Text style={dbt.gameMeta}>
                        {debt.gameName} · {new Date(debt.gameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                    </View>
                    <TouchableOpacity style={dbt.settleBtn} onPress={() => onSettle(debt.key)} activeOpacity={0.75}>
                      <Text style={dbt.settleBtnTxt}>✓ Mark Paid</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}

            {paid.length > 0 && (
              <>
                <TouchableOpacity style={dbt.toggleRow} onPress={() => setShowSettled(v => !v)} activeOpacity={0.7}>
                  <Text style={dbt.sectionLabel}>Settled ({paid.length})</Text>
                  <Text style={{ color: C.blue, fontSize: 13, fontWeight: '600' }}>{showSettled ? 'Hide ▲' : 'Show ▼'}</Text>
                </TouchableOpacity>
                {showSettled && paid.map(debt => (
                  <View key={debt.key} style={[dbt.debtCard, { opacity: 0.45 }]}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                        <Text style={[dbt.fromName, { textDecorationLine: 'line-through' }]}>{debt.from}</Text>
                        <Text style={dbt.arrow}>owes</Text>
                        <Text style={[dbt.toName, { textDecorationLine: 'line-through' }]}>{debt.to}</Text>
                        <Text style={[dbt.amount, { textDecorationLine: 'line-through' }]}>{fmt(debt.amount)}</Text>
                      </View>
                      <Text style={dbt.gameMeta}>{debt.gameName}</Text>
                    </View>
                    <TouchableOpacity style={dbt.undoBtn} onPress={() => onUnsettle(debt.key)} activeOpacity={0.75}>
                      <Text style={dbt.undoBtnTxt}>Undo</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const dbt = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
  title: { color: C.text, fontSize: 20, fontWeight: '800' },
  badge: { backgroundColor: C.red, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 },
  badgeTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  sectionLabel: { color: C.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  debtCard: { backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  fromName: { color: C.red, fontSize: 15, fontWeight: '700' },
  arrow: { color: C.textMuted, fontSize: 13 },
  toName: { color: C.green, fontSize: 15, fontWeight: '700' },
  amount: { color: C.text, fontSize: 16, fontWeight: '800' },
  gameMeta: { color: C.textMuted, fontSize: 11 },
  settleBtn: { backgroundColor: C.greenDim, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: C.green, marginLeft: 10 },
  settleBtnTxt: { color: C.green, fontSize: 12, fontWeight: '700' },
  undoBtn: { backgroundColor: C.surfaceRaised, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border, marginLeft: 10 },
  undoBtnTxt: { color: C.textMuted, fontSize: 12, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTxt: { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySub: { color: C.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  allClear: { alignItems: 'center', paddingVertical: 32 },
  allClearTxt: { color: C.green, fontSize: 22, fontWeight: '800' },
  allClearSub: { color: C.textMuted, fontSize: 14, marginTop: 4 },
  shareBtn: { backgroundColor: C.surfaceRaised, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border },
  shareBtnTxt: { color: C.textSecondary, fontSize: 13, fontWeight: '700' },
});

// ─── RSVP Section ─────────────────────────────────────────────────────────────

// ─── History Modal ────────────────────────────────────────────────────────────
function HistoryModal({ visible, games, onNavigate, onDelete, onClose }) {
  const past = games.filter(g => !g.isActive);
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listH = Math.max(120, screenH * 0.75 - insets.bottom - 140);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={dss.overlay} onPress={onClose}>
        <Pressable style={dss.sheet} onPress={() => {}}>
          <Text style={dss.title}>📋  Game History</Text>
          <Text style={dss.sub}>{past.length} past game{past.length !== 1 ? 's' : ''}</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: listH }} nestedScrollEnabled>
            {past.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>🃏</Text>
                <Text style={{ color: C.textSecondary, fontSize: 16, fontWeight: '600' }}>No past games yet</Text>
                <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' }}>
                  End an active game to see it here
                </Text>
              </View>
            ) : past.map(g => {
              const pot = g.players.reduce((s, p) => s + totalBuyIn(p), 0);
              const date = new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              return (
                <TouchableOpacity key={g.id} style={hm.row} onPress={() => { onNavigate(g.id); onClose(); }} activeOpacity={0.75}>
                  <View style={{ flex: 1 }}>
                    <Text style={hm.name} numberOfLines={1}>{g.name}</Text>
                    <Text style={hm.meta}>{date}  ·  {g.players.length} player{g.players.length !== 1 ? 's' : ''}{pot > 0 ? `  ·  Pot: ${fmt(pot)}` : ''}</Text>
                  </View>
                  <TouchableOpacity onPress={() => onDelete(g.id, g.name)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={{ color: C.textMuted, fontSize: 16 }}>✕</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={[ms.btn, { backgroundColor: C.blue, marginTop: 14 }]} onPress={onClose}>
            <Text style={ms.confirmTxt}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const hm = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  name: { color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 3 },
  meta: { color: C.textMuted, fontSize: 13 },
});

// ─── Home Screen ──────────────────────────────────────────────────────────────
function HomeScreen({ onNavigate }) {
  const { games, roster, settled, isLocked, createGame, deleteGame,
    addToRoster, removeFromRoster, setRosterPhone, settleDebt, unsettleDebt, lockApp, unlockApp } = useStore();
  const [showModal, setShowModal] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showDebts, setShowDebts] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [name, setName] = useState('');

  const handleCreate = () => { const id = createGame(name); setName(''); setShowModal(false); onNavigate(id); };
  const handleDelete = (id, n) => Alert.alert('Delete Game', `Delete "${n}"?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => deleteGame(id) },
  ]);

  const active = games.filter(g => g.isActive);

  const debtCount = games.filter(g => !g.isActive)
    .flatMap(g => calcSettlements(g.players).map(s => debtKey(g.id, s.from, s.to)))
    .filter(k => !settled[k]).length;

  return (
    <SafeAreaView style={hs.root}>
      {/* ── Header ── */}
      <View style={hs.header}>
        <View style={hs.aceCard}>
          <Text style={hs.aceRank}>A</Text>
          <Text style={hs.aceSuit}>♠</Text>
        </View>
        <Text style={hs.title}>Poker Night Tracker</Text>
        <View style={hs.aceCard}>
          <Text style={hs.aceRank}>A</Text>
          <Text style={[hs.aceSuit, { color: '#e53935' }]}>♥</Text>
        </View>
      </View>

      {/* ── Active games list ── */}
      {isLocked ? (
        /* Locked overlay on game list */
        <View style={hs.empty}>
          <Text style={{ fontSize: 56, marginBottom: 14 }}>🔒</Text>
          <Text style={hs.emptyTitle}>App is Locked</Text>
          <Text style={hs.emptySub}>Tap the Lock tab below to unlock and access your games</Text>
        </View>
      ) : active.length === 0 ? (
        <View style={hs.empty}>
          <Text style={{ fontSize: 64, marginBottom: 16 }}>♠️</Text>
          <Text style={hs.emptyTitle}>No active games</Text>
          <Text style={hs.emptySub}>Start a new game or check History for past sessions</Text>
        </View>
      ) : (
        <FlatList data={active} keyExtractor={g => g.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 12 }}
          renderItem={({ item: g }) => {
            const pot = g.players.reduce((s, p) => s + totalBuyIn(p), 0);
            const date = new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            return (
              <TouchableOpacity style={hs.card} onPress={() => onNavigate(g.id)} activeOpacity={0.75}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Text style={hs.cardName} numberOfLines={1}>{g.name}</Text>
                    <View style={hs.badge}><Text style={hs.badgeTxt}>LIVE</Text></View>
                  </View>
                  <Text style={hs.cardDate}>{date}</Text>
                  <Text style={hs.cardMeta}>{g.players.length} player{g.players.length !== 1 ? 's' : ''}{pot > 0 ? `  ·  Pot: ${fmt(pot)}` : ''}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDelete(g.id, g.name)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Text style={{ color: C.textMuted, fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ── Bottom dock ── */}
      <View style={hs.dock}>
        {/* New Game button */}
        <TouchableOpacity
          style={[hs.newGameBtn, isLocked && hs.newGameBtnLocked]}
          onPress={() => isLocked
            ? Alert.alert('App is Locked', 'Tap the Lock tab to unlock the app first.')
            : setShowModal(true)
          }
          activeOpacity={0.85}>
          <Text style={[hs.newGameIcon, isLocked && { color: C.textMuted }]}>
            {isLocked ? '🔒' : '＋'}
          </Text>
          <Text style={[hs.newGameTxt, isLocked && { color: C.textMuted }]}>
            {isLocked ? 'New Game  (locked)' : 'New Game'}
          </Text>
        </TouchableOpacity>

        {/* Lock toggle row */}
        <View style={hs.lockRow}>
          <Text style={hs.lockIcon}>{isLocked ? '🔒' : '🔓'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[hs.lockLabel, isLocked && { color: C.red }]}>
              {isLocked ? 'App Locked' : 'App Unlocked'}
            </Text>
            <Text style={hs.lockSub}>
              {isLocked ? 'Tap to unlock all features' : 'Tap to lock editing'}
            </Text>
          </View>
          <Switch
            value={isLocked}
            onValueChange={v => v
              ? Alert.alert('Lock App', 'Lock the app to prevent any changes?',
                  [{ text: 'Cancel', style: 'cancel' }, { text: 'Lock', onPress: lockApp }])
              : unlockApp()
            }
            trackColor={{ false: C.surfaceRaised, true: '#5c1a1a' }}
            thumbColor={isLocked ? C.red : C.green}
            ios_backgroundColor={C.surfaceRaised}
          />
        </View>

        {/* Tab bar — 4 items, no Lock tab */}
        <View style={hs.tabBar}>
          <TouchableOpacity
            style={[hs.tabItem, isLocked && hs.tabItemDisabled]}
            onPress={() => isLocked
              ? Alert.alert('App is Locked', 'Unlock the app to access the Roster.')
              : setShowRoster(true)}
            activeOpacity={isLocked ? 1 : 0.7}>
            <Text style={[hs.tabIcon, isLocked && { opacity: 0.35 }]}>👥</Text>
            <Text style={[hs.tabLabel, isLocked && { opacity: 0.35 }]}>Roster</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[hs.tabItem, isLocked && hs.tabItemDisabled]}
            onPress={() => isLocked
              ? Alert.alert('App is Locked', 'Unlock the app to view Stats.')
              : setShowStats(true)}
            activeOpacity={isLocked ? 1 : 0.7}>
            <Text style={[hs.tabIcon, isLocked && { opacity: 0.35 }]}>📊</Text>
            <Text style={[hs.tabLabel, isLocked && { opacity: 0.35 }]}>Stats</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[hs.tabItem, isLocked && hs.tabItemDisabled]}
            onPress={() => isLocked
              ? Alert.alert('App is Locked', 'Unlock the app to view Settle Up.')
              : setShowDebts(true)}
            activeOpacity={isLocked ? 1 : 0.7}>
            <Text style={[hs.tabIcon, isLocked && { opacity: 0.35 }]}>💰</Text>
            <Text style={[hs.tabLabel, isLocked && { opacity: 0.35 }]}>Settle Up</Text>
            {debtCount > 0 && !isLocked && (
              <View style={hs.debtBadge}><Text style={hs.debtBadgeTxt}>{debtCount}</Text></View>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={hs.tabItem} onPress={() => setShowHistory(true)} activeOpacity={0.7}>
            <Text style={hs.tabIcon}>📋</Text>
            <Text style={hs.tabLabel}>History</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Modals ── */}
      <Modal visible={showModal} transparent animationType="fade">
        <Pressable style={ms.overlay} onPress={() => setShowModal(false)}>
          <Pressable style={ms.box} onPress={() => {}}>
            <Text style={ms.title}>New Game</Text>
            <TextInput style={[ms.input, { marginTop: 12 }]} placeholder="e.g. Friday Night Poker"
              placeholderTextColor={C.textMuted} value={name} onChangeText={setName}
              autoFocus maxLength={40} onSubmitEditing={handleCreate} returnKeyType="done" />
            <View style={ms.row}>
              <TouchableOpacity style={[ms.btn, ms.cancel]} onPress={() => { setName(''); setShowModal(false); }}>
                <Text style={ms.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ms.btn, { backgroundColor: C.green }]} onPress={handleCreate}>
                <Text style={[ms.confirmTxt, { color: '#000' }]}>Start</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <RosterModal visible={showRoster} roster={roster}
        onClose={() => setShowRoster(false)}
        onAdd={addToRoster} onRemove={removeFromRoster} onSetPhone={setRosterPhone} />
      <PlayerStatsModal visible={showStats} games={games} onClose={() => setShowStats(false)} />
      <DebtsModal visible={showDebts} games={games} settled={settled}
        onClose={() => setShowDebts(false)}
        onSettle={settleDebt} onUnsettle={unsettleDebt} />
      <HistoryModal visible={showHistory} games={games}
        onNavigate={onNavigate} onDelete={handleDelete}
        onClose={() => setShowHistory(false)} />
    </SafeAreaView>
  );
}

const hs = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  title: { color: C.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5, flex: 1, textAlign: 'center' },
  aceCard: {
    backgroundColor: '#ffffff', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5,
    alignItems: 'center', minWidth: 36, borderWidth: 1, borderColor: '#cccccc',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  aceRank: { color: '#111827', fontSize: 15, fontWeight: '900', lineHeight: 18 },
  aceSuit: { color: '#111827', fontSize: 12, lineHeight: 14 },

  // Game list
  secHeader: { color: C.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 12, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: C.surface, borderRadius: 14, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  cardName: { color: C.text, fontSize: 17, fontWeight: '700', flex: 1 },
  badge: { backgroundColor: C.greenDim, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeTxt: { color: C.green, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  cardDate: { color: C.textMuted, fontSize: 13, marginBottom: 4 },
  cardMeta: { color: C.textSecondary, fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  emptyTitle: { color: C.text, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  emptySub: { color: C.textMuted, fontSize: 15, textAlign: 'center', paddingHorizontal: 32 },

  // Bottom dock
  dock: { borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface, paddingBottom: 4 },

  // New game button
  newGameBtn: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 8,
    backgroundColor: C.green, borderRadius: 14,
    paddingVertical: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  newGameBtnLocked: {
    backgroundColor: C.surfaceRaised,
    borderWidth: 1, borderColor: C.border, borderStyle: 'dashed',
  },
  newGameIcon: { color: '#000', fontSize: 20, fontWeight: '900', lineHeight: 22 },
  newGameTxt: { color: '#000', fontSize: 16, fontWeight: '800' },

  // Lock toggle row
  lockRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: C.surface, borderRadius: 14,
    paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: C.border,
  },
  lockIcon: { fontSize: 20 },
  lockLabel: { color: C.text, fontSize: 13, fontWeight: '700' },
  lockSub: { color: C.textMuted, fontSize: 11, marginTop: 1 },

  // Tab bar
  tabBar: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border,
    paddingTop: 8, paddingBottom: 6, paddingHorizontal: 4,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, borderRadius: 10, position: 'relative' },
  tabItemDisabled: { opacity: 0.5 },
  tabIcon: { fontSize: 20, marginBottom: 3 },
  tabLabel: { color: C.textMuted, fontSize: 10, fontWeight: '600' },

  // Debt badge on Settle Up tab
  debtBadge: {
    position: 'absolute', top: 0, right: 10,
    backgroundColor: C.red, borderRadius: 7,
    minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  debtBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '900' },
});

// ─── Game Screen ──────────────────────────────────────────────────────────────
function GameScreen({ id, onBack }) {
  const { games, roster, isLocked, endGame, addPlayer, removePlayer, addBuyIn, setCashOut, clearCashOut,
    addToRoster, setTableAmount, clearTableAmount } = useStore();
  const game = games.find(g => g.id === id);
  const [modal, setModal] = useState(null);
  const canEdit = !isLocked;

  const handleEnd = useCallback(() => {
    if (!game) return;
    const missing = game.players.filter(p => p.cashOut === null && totalBuyIn(p) > 0);
    const pot_ = game.players.reduce((s, p) => s + totalBuyIn(p), 0);
    const totalOut_ = game.players.reduce((s, p) => s + (p.cashOut ?? 0), 0) + (game.tableAmount ?? 0);
    const bal_ = Math.round((totalOut_ - pot_) * 100) / 100;
    const doEnd = () => endGame(game.id);

    let msg = '';
    if (missing.length) msg += `${missing.map(p => p.name).join(', ')} haven't cashed out yet.\n\n`;
    if (game.tableAmount === null) msg += '⚠️ Table amount has not been set.\n\n';
    if (bal_ !== 0 && game.tableAmount !== null) {
      const diff = fmt(Math.abs(bal_));
      msg += bal_ > 0
        ? `⚠️ Cash out exceeds pot by ${diff} — please review amounts.\n\n`
        : `⚠️ Cash out is ${diff} short of the pot — please review amounts.\n\n`;
    }
    msg += 'End the game?';

    Alert.alert('End Game', msg.trim(), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End Game', style: 'destructive', onPress: doEnd },
    ]);
  }, [game, endGame]);

  const handleShare = useCallback(async () => {
    if (!game) return;
    try { await Share.share({ message: shareText(game) }); } catch {}
  }, [game]);

  const sendBuyInSms = useCallback(async (playerName, amount) => {
    const rosterEntry = roster.find(r => r.name === playerName);
    if (!rosterEntry?.phone) return;
    const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const body = `Hi ${playerName}! 🃏 You've bought in for $${Number.isInteger(amount) ? amount : amount.toFixed(2)} at "${game.name}".\nTime: ${time}`;
    try {
      await Linking.openURL(`sms:${rosterEntry.phone}?body=${encodeURIComponent(body)}`);
    } catch {}
  }, [roster, game]);

  if (!game) return (
    <SafeAreaView style={gs.root}>
      <View style={gs.header}>
        <TouchableOpacity onPress={onBack} style={gs.backBtn}><Text style={gs.backTxt}>‹ Games</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  const settlements = game.isActive ? [] : calcSettlements(game.players);
  const pot = game.players.reduce((s, p) => s + totalBuyIn(p), 0);
  const tableAmt = game.tableAmount ?? 0;
  const totalCashOut = game.players.reduce((s, p) => s + (p.cashOut ?? 0), 0) + tableAmt;
  const cashedOut = game.players.filter(p => p.cashOut !== null).length;
  const allCashedOut = game.players.length > 0 && cashedOut === game.players.length;
  const balance = Math.round((totalCashOut - pot) * 100) / 100;
  const hasImbalance = allCashedOut && (game.tableAmount !== null) && balance !== 0;
  // Players still in the game (no cash out yet)
  const activePlayers = game.players.filter(p => p.cashOut === null);

  return (
    <SafeAreaView style={gs.root}>
      <View style={gs.header}>
        <TouchableOpacity onPress={onBack} style={gs.backBtn}><Text style={gs.backTxt}>‹ Games</Text></TouchableOpacity>
        <Text style={gs.headerTitle} numberOfLines={1}>{game.name}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: C.textSecondary, fontSize: 14, marginBottom: 6 }}>
            {new Date(game.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
          {game.isActive
            ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.green }} /><Text style={{ color: C.green, fontSize: 13, fontWeight: '700' }}>Live</Text></View>
            : <Text style={{ color: C.textMuted, fontSize: 13 }}>Ended {game.endedAt ? new Date(game.endedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}</Text>
          }
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: hasImbalance ? 10 : 24 }}>
          {[
            { label: 'Total Pot', value: pot > 0 ? fmt(pot) : '—', accent: true },
            { label: 'Players', value: String(game.players.length) },
            { label: 'Cashed Out', value: `${cashedOut}/${game.players.length}` },
            {
              label: 'Balance',
              value: (game.tableAmount === null && !allCashedOut) ? '—' : balance === 0 ? '✓' : (balance > 0 ? '+' : '') + fmt(balance),
              balOk: allCashedOut && balance === 0,
              balErr: hasImbalance,
            },
          ].map(s => (
            <View key={s.label} style={[
              gs.statBox,
              s.accent && { borderColor: C.greenDim, backgroundColor: '#0d1f14' },
              s.balOk && { borderColor: C.greenDim, backgroundColor: '#0d1f14' },
              s.balErr && { borderColor: C.red, backgroundColor: '#1f0d0d' },
            ]}>
              <Text
                style={[
                  gs.statVal,
                  s.accent && { color: C.green },
                  s.balOk && { color: C.green },
                  s.balErr && { color: C.red },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              >{s.value}</Text>
              <Text
                style={gs.statLbl}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Imbalance warning banner */}
        {hasImbalance && (
          <View style={gs.imbalanceBanner}>
            <Text style={gs.imbalanceTitle}>
              {balance > 0 ? '⚠️  Cash out is over by ' : '⚠️  Cash out is short by '}
              <Text style={{ fontWeight: '900' }}>{fmt(Math.abs(balance))}</Text>
            </Text>
            <Text style={gs.imbalanceSub}>
              {balance > 0
                ? 'Total cashed out exceeds the pot. Use "Adjust Cash Out" on any player\'s row to correct the amount.'
                : 'Total cashed out is less than the pot. Use "Adjust Cash Out" on any player\'s row to correct the amount.'}
            </Text>
          </View>
        )}

        {/* Players */}
        <Text style={gs.secTitle}>Players</Text>
        {game.players.length === 0 && (
          <View style={[gs.emptyBox, { marginBottom: 10 }]}>
            <Text style={{ color: C.textMuted, fontSize: 14 }}>No players yet — add someone to start</Text>
          </View>
        )}
        {game.players.map(player => {
          const bi = totalBuyIn(player), net = playerNet(player), hasOut = player.cashOut !== null;
          const netCol = net > 0 ? C.green : net < 0 ? C.red : C.textMuted;
          const initials = player.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
          const noBuyIn = bi === 0;
          // Disable buy-in if: locked, or player cashed out, or this is the last active player
          const isLastActive = activePlayers.length === 1 && activePlayers[0].id === player.id;
          const buyInDisabled = !canEdit || hasOut || isLastActive;
          const cashOutDisabled = !canEdit || hasOut || noBuyIn;
          return (
            <View key={player.id} style={[gs.playerCard, hasOut && gs.playerCardDone]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={[gs.avatar, hasOut && { backgroundColor: C.surfaceRaised }]}>
                  <Text style={[gs.avatarTxt, hasOut && { color: C.textMuted }]}>{initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[gs.playerName, hasOut && { color: C.textSecondary }]}>{player.name}</Text>
                    {hasOut && <View style={{ backgroundColor: C.greenDim, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 }}>
                      <Text style={{ color: C.green, fontSize: 10, fontWeight: '800' }}>CASHED OUT</Text>
                    </View>}
                    {isLastActive && game.isActive && (
                      <View style={{ backgroundColor: '#1a1500', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 }}>
                        <Text style={{ color: C.gold, fontSize: 10, fontWeight: '800' }}>LAST PLAYER</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {[['In', bi > 0 ? fmt(bi) : '—', null], ['Out', hasOut ? fmt(player.cashOut) : '—', null], ['Net', (bi > 0 || hasOut) ? fmtNet(net) : '—', netCol]].map(([lbl, val, col], idx) => (
                      <React.Fragment key={lbl}>
                        {idx > 0 && <View style={gs.divider} />}
                        <View style={gs.amtCol}>
                          <Text style={gs.amtLbl}>{lbl}</Text>
                          <Text style={[gs.amtVal, col && { color: col, fontWeight: '700' }]}>{val}</Text>
                        </View>
                      </React.Fragment>
                    ))}
                  </View>
                </View>
                {game.isActive && canEdit && !hasOut && (
                  <TouchableOpacity onPress={() => Alert.alert('Remove', `Remove ${player.name}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => removePlayer(game.id, player.id) }])}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4, marginLeft: 4 }}>
                    <Text style={{ color: C.textMuted, fontSize: 14 }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
              {player.buyIns.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}>
                  {player.buyIns.map(b => <View key={b.id} style={gs.chip}><Text style={{ color: C.textSecondary, fontSize: 12, fontWeight: '600' }}>{fmt(b.amount)}</Text></View>)}
                </View>
              )}
              {game.isActive && !hasOut && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity
                    style={[gs.actionBtn, buyInDisabled && gs.actionBtnDisabled]}
                    onPress={() => !buyInDisabled && setModal({ type: 'buyIn', player })}
                    activeOpacity={buyInDisabled ? 1 : 0.7}>
                    <Text style={[gs.actionTxt, buyInDisabled && { color: C.textMuted }]}>
                      {isLastActive ? '— Last Player' : '+ Buy In'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[gs.actionBtn, cashOutDisabled && gs.actionBtnDisabled]}
                    onPress={() => !cashOutDisabled && setModal({ type: 'cashOut', player })}
                    activeOpacity={cashOutDisabled ? 1 : 0.7}>
                    <Text style={[gs.actionTxt, cashOutDisabled && { color: C.textMuted }]}>
                      {noBuyIn ? 'Cash Out (no buy-in)' : 'Cash Out'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              {/* Adjustment button visible on cashed-out rows only when balance is off */}
              {game.isActive && hasOut && canEdit && hasImbalance && (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}>
                  <TouchableOpacity
                    style={[gs.actionBtn, { borderColor: C.gold }]}
                    onPress={() => setModal({ type: 'cashOut', player })}
                    activeOpacity={0.7}>
                    <Text style={[gs.actionTxt, { color: C.gold }]}>⚠️  Adjust Cash Out</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        {/* Table Amount */}
        {game.isActive && (
          <View style={gs.tableAmtCard}>
            <View style={{ flex: 1 }}>
              <Text style={gs.secTitle}>Table Amount</Text>
              <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 4 }}>
                Money remaining on the table (house, tips, unaccounted chips)
              </Text>
              {game.tableAmount !== null && (
                <Text style={{ color: C.gold, fontSize: 20, fontWeight: '800' }}>{fmt(game.tableAmount)}</Text>
              )}
            </View>
            {canEdit && (
              <TouchableOpacity
                style={[gs.actionBtn, { width: 90, marginLeft: 12 }, game.tableAmount !== null && { borderColor: C.gold }]}
                onPress={() => setModal({ type: 'tableAmount' })} activeOpacity={0.7}>
                <Text style={[gs.actionTxt, game.tableAmount !== null && { color: C.gold }]}>
                  {game.tableAmount !== null ? `✓ ${fmt(game.tableAmount)}` : 'Set Amount'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {game.isActive && canEdit && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
            <TouchableOpacity style={[gs.addBtn, { flex: 1, marginBottom: 0 }]} onPress={() => setModal({ type: 'addPlayer' })} activeOpacity={0.7}>
              <Text style={{ color: C.blue, fontSize: 15, fontWeight: '700' }}>+ Add Player</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[gs.addBtn, { flex: 1, marginBottom: 0, borderColor: '#3d3510' }]} onPress={() => setModal({ type: 'drawSeats' })} activeOpacity={0.7}>
              <Text style={{ color: C.gold, fontSize: 15, fontWeight: '700' }}>♠ Draw Seats</Text>
            </TouchableOpacity>
          </View>
        )}

        {!game.isActive && (
          <>
            <Text style={[gs.secTitle, { marginTop: 8 }]}>Settle Up</Text>
            {settlements.length === 0
              ? <View style={[gs.emptyBox, { borderColor: C.greenDim }]}><Text style={{ color: C.green, fontSize: 16, fontWeight: '600' }}>🎉 Everyone is square!</Text></View>
              : settlements.map((s, i) => (
                <View key={i} style={gs.settlRow}>
                  <Text style={[gs.settlName, { color: C.red }]}>{s.from}</Text>
                  <Text style={{ color: C.textMuted, fontSize: 16, marginHorizontal: 10 }}>→</Text>
                  <Text style={[gs.settlName, { color: C.green }]}>{s.to}</Text>
                  <Text style={{ color: C.text, fontSize: 16, fontWeight: '800', minWidth: 64, textAlign: 'right' }}>{fmt(s.amount)}</Text>
                </View>
              ))
            }
          </>
        )}

        <View style={{ marginTop: 16 }}>
          {game.isActive
            ? canEdit
              ? <TouchableOpacity style={gs.endBtn} onPress={handleEnd} activeOpacity={0.8}><Text style={{ color: C.red, fontSize: 17, fontWeight: '700' }}>End Game</Text></TouchableOpacity>
              : <View style={[gs.endBtn, { backgroundColor: C.surfaceRaised, borderColor: C.border }]}><Text style={{ color: C.textMuted, fontSize: 15, fontWeight: '600' }}>🔒  Unlock the app to end the game</Text></View>
            : <TouchableOpacity style={gs.shareBtn} onPress={handleShare} activeOpacity={0.8}><Text style={{ color: C.green, fontSize: 17, fontWeight: '700' }}>📤  Share Results</Text></TouchableOpacity>
          }
        </View>
      </ScrollView>

      <AddPlayerModal visible={modal?.type === 'addPlayer'} onClose={() => setModal(null)}
        roster={roster} existingNames={game.players.filter(p => p.cashOut === null).map(p => p.name)}
        cashedOutNames={game.players.filter(p => p.cashOut !== null).map(p => p.name)}
        onAdd={n => addPlayer(game.id, n)} onAddToRoster={addToRoster} />
      {modal?.type === 'buyIn' && (
        <BuyInModal visible playerName={modal.player.name} onClose={() => setModal(null)}
          onAdd={amt => { addBuyIn(game.id, modal.player.id, amt); sendBuyInSms(modal.player.name, amt); setModal(null); }} />
      )}
      {modal?.type === 'cashOut' && (
        <CashOutModal visible playerName={modal.player.name} currentAmount={modal.player.cashOut}
          onClose={() => setModal(null)}
          onSave={amt => { setCashOut(game.id, modal.player.id, amt); setModal(null); }}
          onClear={() => { clearCashOut(game.id, modal.player.id); setModal(null); }} />
      )}
      {modal?.type === 'tableAmount' && (
        <CashOutModal visible playerName="Table" currentAmount={game.tableAmount}
          onClose={() => setModal(null)}
          onSave={amt => { setTableAmount(game.id, amt); setModal(null); }}
          onClear={() => { clearTableAmount(game.id); setModal(null); }} />
      )}
      {modal?.type === 'drawSeats' && (
        <DrawSeatsModal visible players={game.players} onClose={() => setModal(null)} />
      )}
    </SafeAreaView>
  );
}

const gs = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
  backBtn: { paddingRight: 12, paddingVertical: 4 },
  backTxt: { color: C.blue, fontSize: 17 },
  headerTitle: { flex: 1, color: C.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  secTitle: { color: C.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12, marginLeft: 2 },
  statBox: { flex: 1, backgroundColor: C.surface, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  statVal: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 2, width: '100%', textAlign: 'center' },
  statLbl: { color: C.textMuted, fontSize: 10, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase', width: '100%', textAlign: 'center' },
  playerCard: { backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  playerCardDone: { opacity: 0.65, borderColor: C.border },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.blueDim, alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 },
  avatarTxt: { color: C.blue, fontSize: 14, fontWeight: '800' },
  playerName: { color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  amtCol: { alignItems: 'center', flex: 1 },
  amtLbl: { color: C.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  amtVal: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
  divider: { width: 1, height: 28, backgroundColor: C.border, marginHorizontal: 8 },
  chip: { backgroundColor: C.surfaceRaised, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: C.border },
  actionBtn: { flex: 1, backgroundColor: C.surfaceRaised, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  actionBtnDisabled: { opacity: 0.38 },
  actionTxt: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
  addBtn: { backgroundColor: C.surface, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: C.border, marginBottom: 24 },
  emptyBox: { backgroundColor: C.surface, borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  settlRow: { backgroundColor: C.surface, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: C.border },
  settlName: { fontSize: 15, fontWeight: '700', flex: 1 },
  endBtn: { backgroundColor: C.redDim, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: C.red },
  shareBtn: { backgroundColor: C.greenDim, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: C.green },
  tableAmtCard: {
    backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 16,
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#3d3510',
  },
  imbalanceBanner: {
    backgroundColor: '#1f0d0d', borderRadius: 12, padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: C.red,
  },
  imbalanceTitle: { color: C.red, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  imbalanceSub: { color: '#cc8880', fontSize: 13, lineHeight: 18 },
});

// ─── Root ─────────────────────────────────────────────────────────────────────
function App() {
  const [gameId, setGameId] = useState(null);
  return (
    <SafeAreaProvider>
      <StoreProvider>
        {gameId ? <GameScreen id={gameId} onBack={() => setGameId(null)} /> : <HomeScreen onNavigate={setGameId} />}
      </StoreProvider>
    </SafeAreaProvider>
  );
}

registerRootComponent ? registerRootComponent(App) : null;
export default App;
