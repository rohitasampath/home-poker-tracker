import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  Pressable,
  SafeAreaView,
} from 'react-native';
import { Colors } from '../constants/theme';
import { useGameStore } from '../store/gameStore';
import { GameSession } from '../types';
import { formatMoney, playerTotalBuyIn } from '../utils/settlement';

interface Props {
  onNavigateToGame: (id: string) => void;
}

function GameCard({
  game,
  onPress,
  onDelete,
}: {
  game: GameSession;
  onPress: () => void;
  onDelete: () => void;
}) {
  const totalPot = game.players.reduce((s, p) => s + playerTotalBuyIn(p), 0);
  const dateStr = new Date(game.date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardLeft}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardName} numberOfLines={1}>{game.name}</Text>
          {game.isActive && (
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardDate}>{dateStr}</Text>
        <View style={styles.cardMeta}>
          <Text style={styles.cardMetaText}>
            {game.players.length} player{game.players.length !== 1 ? 's' : ''}
          </Text>
          {totalPot > 0 && (
            <>
              <Text style={styles.cardMetaDot}>·</Text>
              <Text style={styles.cardMetaText}>Pot: {formatMoney(totalPot)}</Text>
            </>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={onDelete}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={styles.deleteBtnText}>✕</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function HomeScreen({ onNavigateToGame }: Props) {
  const { games, createGame, deleteGame } = useGameStore();
  const [showNewModal, setShowNewModal] = useState(false);
  const [newGameName, setNewGameName] = useState('');

  const handleCreate = useCallback(() => {
    const id = createGame(newGameName);
    setNewGameName('');
    setShowNewModal(false);
    onNavigateToGame(id);
  }, [createGame, newGameName, onNavigateToGame]);

  const handleDelete = useCallback(
    (gameId: string, gameName: string) => {
      Alert.alert('Delete Game', `Delete "${gameName}"? This cannot be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteGame(gameId) },
      ]);
    },
    [deleteGame]
  );

  const activeGames = games.filter((g) => g.isActive);
  const pastGames = games.filter((g) => !g.isActive);

  const sections: Array<{ type: 'header'; title: string } | { type: 'game'; game: GameSession }> = [];
  if (activeGames.length > 0) {
    sections.push({ type: 'header', title: 'Active' });
    activeGames.forEach((g) => sections.push({ type: 'game', game: g }));
  }
  if (pastGames.length > 0) {
    sections.push({ type: 'header', title: 'Past Games' });
    pastGames.forEach((g) => sections.push({ type: 'game', game: g }));
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>🃏</Text>
        <Text style={styles.headerTitle}>Poker Tracker</Text>
      </View>

      {games.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>♠️</Text>
          <Text style={styles.emptyTitle}>No games yet</Text>
          <Text style={styles.emptySubtitle}>Start a new game to begin tracking</Text>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item, idx) => item.type === 'header' ? `h-${idx}` : item.game.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            if (item.type === 'header') return <Text style={styles.sectionHeader}>{item.title}</Text>;
            return (
              <GameCard
                game={item.game}
                onPress={() => onNavigateToGame(item.game.id)}
                onDelete={() => handleDelete(item.game.id, item.game.name)}
              />
            );
          }}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setShowNewModal(true)} activeOpacity={0.8}>
        <Text style={styles.fabIcon}>+</Text>
        <Text style={styles.fabText}>New Game</Text>
      </TouchableOpacity>

      <Modal visible={showNewModal} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={() => setShowNewModal(false)}>
          <Pressable style={styles.modalBox} onPress={() => {}}>
            <Text style={styles.modalTitle}>New Game</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Friday Night Poker"
              placeholderTextColor={Colors.textMuted}
              value={newGameName}
              onChangeText={setNewGameName}
              autoFocus
              maxLength={40}
              onSubmitEditing={handleCreate}
              returnKeyType="done"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnCancel]}
                onPress={() => { setNewGameName(''); setShowNewModal(false); }}
              >
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnConfirm]} onPress={handleCreate}>
                <Text style={styles.btnConfirmText}>Start</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerEmoji: { fontSize: 28 },
  headerTitle: { color: Colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  list: { padding: 16, paddingBottom: 100 },
  sectionHeader: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 12, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cardLeft: { flex: 1 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardName: { color: Colors.text, fontSize: 17, fontWeight: '700', flex: 1 },
  liveBadge: { backgroundColor: Colors.greenDim, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  liveBadgeText: { color: Colors.green, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  cardDate: { color: Colors.textMuted, fontSize: 13, marginBottom: 8 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardMetaText: { color: Colors.textSecondary, fontSize: 13 },
  cardMetaDot: { color: Colors.textMuted, fontSize: 13 },
  deleteBtn: { padding: 4, marginLeft: 12 },
  deleteBtnText: { color: Colors.textMuted, fontSize: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { color: Colors.text, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: Colors.textMuted, fontSize: 15, textAlign: 'center' },
  fab: { position: 'absolute', bottom: 36, left: 24, right: 24, backgroundColor: Colors.green, borderRadius: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: Colors.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  fabIcon: { color: '#000', fontSize: 22, fontWeight: '800', lineHeight: 22 },
  fabText: { color: '#000', fontSize: 17, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: Colors.surfaceAlt, borderRadius: 20, padding: 24, width: '100%', borderWidth: 1, borderColor: Colors.border },
  modalTitle: { color: Colors.text, fontSize: 20, fontWeight: '700', marginBottom: 16 },
  modalInput: { backgroundColor: Colors.surfaceRaised, borderRadius: 12, padding: 14, color: Colors.text, fontSize: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnCancel: { backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.border },
  btnCancelText: { color: Colors.textSecondary, fontSize: 16, fontWeight: '600' },
  btnConfirm: { backgroundColor: Colors.green },
  btnConfirmText: { color: '#000', fontSize: 16, fontWeight: '700' },
});
