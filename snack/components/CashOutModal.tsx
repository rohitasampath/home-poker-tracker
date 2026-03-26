import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Colors } from '../constants/theme';

interface Props {
  visible: boolean;
  playerName: string;
  currentAmount: number | null;
  onClose: () => void;
  onSave: (amount: number) => void;
  onClear: () => void;
}

export default function CashOutModal({
  visible,
  playerName,
  currentAmount,
  onClose,
  onSave,
  onClear,
}: Props) {
  const [raw, setRaw] = useState('');

  useEffect(() => {
    if (visible) {
      setRaw(currentAmount !== null ? String(currentAmount) : '');
    }
  }, [visible, currentAmount]);

  const amount = parseFloat(raw);
  const isValid = !isNaN(amount) && amount >= 0;

  const handleSave = () => {
    if (!isValid) return;
    onSave(amount);
    setRaw('');
  };

  const handleClose = () => {
    setRaw('');
    onClose();
  };

  const handleClear = () => {
    onClear();
    setRaw('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.box} onPress={() => {}}>
          <Text style={styles.title}>Cash Out</Text>
          <Text style={styles.subtitle}>{playerName}</Text>

          <View style={styles.inputRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={Colors.textMuted}
              value={raw}
              onChangeText={setRaw}
              keyboardType="decimal-pad"
              returnKeyType="done"
              autoFocus
              onSubmitEditing={handleSave}
            />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={handleClose}>
              <Text style={styles.btnCancelText}>Cancel</Text>
            </TouchableOpacity>
            {currentAmount !== null && (
              <TouchableOpacity style={[styles.btn, styles.btnClear]} onPress={handleClear}>
                <Text style={styles.btnClearText}>Clear</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btn, styles.btnConfirm, !isValid && styles.btnDisabled]}
              onPress={handleSave}
              disabled={!isValid}
            >
              <Text style={styles.btnConfirmText}>Save</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  box: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 14,
    marginBottom: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gold,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  dollarSign: {
    color: Colors.gold,
    fontSize: 22,
    fontWeight: '700',
    marginRight: 4,
  },
  input: {
    flex: 1,
    padding: 14,
    paddingLeft: 0,
    color: Colors.text,
    fontSize: 26,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnCancel: {
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnCancelText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  btnClear: {
    backgroundColor: Colors.redDim,
    borderWidth: 1,
    borderColor: Colors.red,
  },
  btnClearText: {
    color: Colors.red,
    fontSize: 15,
    fontWeight: '600',
  },
  btnConfirm: {
    backgroundColor: Colors.gold,
  },
  btnConfirmText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.4,
  },
});
