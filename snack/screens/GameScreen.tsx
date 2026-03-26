import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Colors } from '../constants/theme';
import { useGameStore } from '../store/gameStore';
import { Player } from '../types';
import {
  formatMoney,
  formatNet,
  playerNet,
  playerTotalBuyIn,
  calculateSettlement,
  generateShareText,
} from '../utils/settlement';
import AddPlayerModal from '../components/AddPlayerModal';
import BuyInModal from '../components/BuyInModal';
import CashOutModal from '../components/CashOutModal';

interface Props {
  id: string;
  onBack: () => void;
}

type ActionModal =
  | { type: 'addPlayer' }
  | { type: 'buyIn'; player: Player }
  | { type: 'cashOut'; player: Player }
  | null;

function StatBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={[statStyles.box, accent && statStyles.boxAccent]}>
      <Text style={[statStyles.value, accent && statStyles.valueAccent]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  box: { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  boxAccent: { borderColor: Colors.greenDim, backgroundColor: '#0d1f14' },
  value: { color: Colors.text, fontSize: 20, fontWeight: '800', marginBottom: 2 },
  valueAccent: { color: Colors.green },
  label: { color: Colors.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
});

function PlayerRow({ player, isActive, onBuyIn, onCashOut, onRemove }: {
  player: Player; isActive: boolean;
  onBuyIn: () => void; onCashOut: () => void; onRemove: () => void;
}) {
  const total = playerTotalBuyIn(player);
  const net = playerNet(player);
  const hasCashOut = player.cashOut !== null;
  const netColor = net > 0 ? Colors.green : net < 0 ? Colors.red : Colors.textMuted;
  const initials = player.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <View style={rowStyles.card}>
      <View style={rowStyles.top}>
        <View style={rowStyles.avatar}>
          <Text style={rowStyles.avatarText}>{initials}</Text>
        </View>
        <View style={rowStyles.info}>
          <Text style={rowStyles.name}>{player.name}</Text>
          <View style={rowStyles.amounts}>
            <View style={rowStyles.amountItem}>
              <Text style={rowStyles.amountLabel}>In</Text>
              <Text style={rowStyles.amountValue}>{total > 0 ? formatMoney(total) : '—'}</Text>
            </View>
            <View style={rowStyles.amountDivider} />
            <View style={rowStyles.amountItem}>
              <Text style={rowStyles.amountLabel}>Out</Text>
              <Text style={rowStyles.amountValue}>{hasCashOut ? formatMoney(player.cashOut!) : '—'}</Text>
            </View>
            <View style={rowStyles.amountDivider} />
            <View style={rowStyles.amountItem}>
              <Text style={rowStyles.amountLabel}>Net</Text>
              <Text style={[rowStyles.amountValue, { color: netColor, fontWeight: '700' }]}>
                {total > 0 || hasCashOut ? formatNet(net) : '—'}
              </Text>
            </View>
          </View>
        </View>
        {isActive && (
          <TouchableOpacity style={rowStyles.removeBtn} onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={rowStyles.removeBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {player.buyIns.length > 0 && (
        <View style={rowStyles.buyInsRow}>
          {player.buyIns.map((b) => (
            <View key={b.id} style={rowStyles.buyInChip}>
              <Text style={rowStyles.buyInChipText}>{formatMoney(b.amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {isActive && (
        <View style={rowStyles.actions}>
          <TouchableOpacity style={rowStyles.actionBtn} onPress={onBuyIn} activeOpacity={0.7}>
            <Text style={rowStyles.actionBtnText}>+ Buy In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[rowStyles.actionBtn, hasCashOut && rowStyles.actionBtnActive]}
            onPress={onCashOut} activeOpacity={0.7}
          >
            <Text style={[rowStyles.actionBtnText, hasCashOut && rowStyles.actionBtnActiveText]}>
              {hasCashOut ? `✓ Cashed Out ${formatMoney(player.cashOut!)}` : 'Cash Out'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const rowStyles = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  top: { flexDirection: 'row', alignItems: 'flex-start' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.blueDim, alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 },
  avatarText: { color: Colors.blue, fontSize: 14, fontWeight: '800' },
  info: { flex: 1 },
  name: { color: Colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  amounts: { flexDirection: 'row', alignItems: 'center' },
  amountItem: { alignItems: 'center', flex: 1 },
  amountLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  amountValue: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
  amountDivider: { width: 1, height: 28, backgroundColor: Colors.border, marginHorizontal: 8 },
  removeBtn: { padding: 4, marginLeft: 4 },
  removeBtnText: { color: Colors.textMuted, fontSize: 14 },
  buyInsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  buyInChip: { backgroundColor: Colors.surfaceRaised, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  buyInChipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, backgroundColor: Colors.surfaceRaised, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  actionBtnActive: { backgroundColor: Colors.greenDim, borderColor: Colors.green },
  actionBtnText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  actionBtnActiveText: { color: Colors.green },
});

export default function GameScreen({ id, onBack }: Props) {
  const { games, endGame, addPlayer, removePlayer, addBuyIn, setCashOut, clearCashOut } = useGameStore();
  const game = games.find((g) => g.id === id);
  const [activeModal, setActiveModal] = useState<ActionModal>(null);

  const handleEndGame = useCallback(() => {
    if (!game) return;
    const missing = game.players.filter((p) => p.cashOut === null && playerTotalBuyIn(p) > 0);
    const confirmEnd = () => endGame(game.id);
    if (missing.length > 0) {
      Alert.alert('End Game', `${missing.map((p) => p.name).join(', ')} haven't cashed out yet. End anyway?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End Game', style: 'destructive', onPress: confirmEnd },
      ]);
    } else {
      Alert.alert('End Game', 'Mark this game as finished?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End Game', style: 'destructive', onPress: confirmEnd },
      ]);
    }
  }, [game, endGame]);

  const handleShare = useCallback(async () => {
    if (!game) return;
    const settlements = calculateSettlement(game.players);
    const text = generateShareText(game.name, game.date, game.players, settlements);
    try { await Share.share({ message: text }); } catch {}
  }, [game]);

  const handleRemovePlayer = useCallback((player: Player) => {
    if (!game) return;
    Alert.alert('Remove Player', `Remove ${player.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removePlayer(game.id, player.id) },
    ]);
  }, [game, removePlayer]);

  if (!game) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ Games</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.notFound}><Text style={styles.notFoundText}>Game not found</Text></View>
      </SafeAreaView>
    );
  }

  const settlements = !game.isActive ? calculateSettlement(game.players) : [];
  const totalPot = game.players.reduce((s, p) => s + playerTotalBuyIn(p), 0);
  const playersWithCashout = game.players.filter((p) => p.cashOut !== null).length;

  return (
    <SafeAreaView style={styles.root}>
      {/* Custom header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Games</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{game.name}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.gameInfo}>
          <Text style={styles.gameDate}>
            {new Date(game.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
          <View style={styles.statusRow}>
            {game.isActive ? (
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Live</Text>
              </View>
            ) : (
              <Text style={styles.endedText}>
                Ended {game.endedAt ? new Date(game.endedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatBox label="Total Pot" value={totalPot > 0 ? formatMoney(totalPot) : '—'} accent />
          <StatBox label="Players" value={String(game.players.length)} />
          <StatBox label="Cashed Out" value={`${playersWithCashout}/${game.players.length}`} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Players</Text>
          {game.players.length === 0 && (
            <View style={styles.emptyPlayers}>
              <Text style={styles.emptyPlayersText}>No players yet — add someone to start</Text>
            </View>
          )}
          {game.players.map((player) => (
            <PlayerRow
              key={player.id}
              player={player}
              isActive={game.isActive}
              onBuyIn={() => setActiveModal({ type: 'buyIn', player })}
              onCashOut={() => setActiveModal({ type: 'cashOut', player })}
              onRemove={() => handleRemovePlayer(player)}
            />
          ))}
        </View>

        {game.isActive && (
          <TouchableOpacity style={styles.addPlayerBtn} onPress={() => setActiveModal({ type: 'addPlayer' })} activeOpacity={0.7}>
            <Text style={styles.addPlayerBtnText}>+ Add Player</Text>
          </TouchableOpacity>
        )}

        {!game.isActive && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Settle Up</Text>
            {settlements.length === 0 ? (
              <View style={styles.settleAll}>
                <Text style={styles.settleAllText}>🎉 Everyone is square!</Text>
              </View>
            ) : (
              settlements.map((s, i) => (
                <View key={i} style={styles.settlementRow}>
                  <Text style={styles.settlementFrom}>{s.from}</Text>
                  <Text style={styles.settlementArrow}>→</Text>
                  <Text style={styles.settlementTo}>{s.to}</Text>
                  <Text style={styles.settlementAmount}>{formatMoney(s.amount)}</Text>
                </View>
              ))
            )}
          </View>
        )}

        <View style={styles.bottomActions}>
          {game.isActive ? (
            <TouchableOpacity style={styles.endGameBtn} onPress={handleEndGame} activeOpacity={0.8}>
              <Text style={styles.endGameBtnText}>End Game</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
              <Text style={styles.shareBtnText}>📤  Share Results</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <AddPlayerModal
        visible={activeModal?.type === 'addPlayer'}
        onClose={() => setActiveModal(null)}
        onAdd={(name) => { addPlayer(game.id, name); setActiveModal(null); }}
      />
      {activeModal?.type === 'buyIn' && (
        <BuyInModal visible playerName={activeModal.player.name}
          onClose={() => setActiveModal(null)}
          onAdd={(amount) => { addBuyIn(game.id, activeModal.player.id, amount); setActiveModal(null); }}
        />
      )}
      {activeModal?.type === 'cashOut' && (
        <CashOutModal visible playerName={activeModal.player.name}
          currentAmount={activeModal.player.cashOut}
          onClose={() => setActiveModal(null)}
          onSave={(amount) => { setCashOut(game.id, activeModal.player.id, amount); setActiveModal(null); }}
          onClear={() => { clearCashOut(game.id, activeModal.player.id); setActiveModal(null); }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
  backBtn: { paddingRight: 12, paddingVertical: 4 },
  backBtnText: { color: Colors.blue, fontSize: 17 },
  headerTitle: { flex: 1, color: Colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  headerRight: { width: 60 },
  scroll: { padding: 16, paddingBottom: 40 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { color: Colors.textMuted, fontSize: 16 },
  gameInfo: { marginBottom: 16 },
  gameDate: { color: Colors.textSecondary, fontSize: 14, marginBottom: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.green },
  liveText: { color: Colors.green, fontSize: 13, fontWeight: '700' },
  endedText: { color: Colors.textMuted, fontSize: 13 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12, marginLeft: 2 },
  emptyPlayers: { backgroundColor: Colors.surface, borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  emptyPlayersText: { color: Colors.textMuted, fontSize: 14 },
  addPlayerBtn: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, marginBottom: 24 },
  addPlayerBtnText: { color: Colors.blue, fontSize: 15, fontWeight: '700' },
  settleAll: { backgroundColor: Colors.surface, borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: Colors.greenDim },
  settleAllText: { color: Colors.green, fontSize: 16, fontWeight: '600' },
  settlementRow: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  settlementFrom: { color: Colors.red, fontSize: 15, fontWeight: '700', flex: 1 },
  settlementArrow: { color: Colors.textMuted, fontSize: 16, marginHorizontal: 10 },
  settlementTo: { color: Colors.green, fontSize: 15, fontWeight: '700', flex: 1 },
  settlementAmount: { color: Colors.text, fontSize: 16, fontWeight: '800', minWidth: 64, textAlign: 'right' },
  bottomActions: { marginTop: 8 },
  endGameBtn: { backgroundColor: Colors.redDim, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.red },
  endGameBtnText: { color: Colors.red, fontSize: 17, fontWeight: '700' },
  shareBtn: { backgroundColor: Colors.greenDim, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.green },
  shareBtnText: { color: Colors.green, fontSize: 17, fontWeight: '700' },
});
