import React, { useState } from 'react';
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

const QUICK_AMOUNTS = [20, 50, 100, 200];

interface Props {
  visible: boolean;
  playerName: string;
  onClose: () => void;
  onAdd: (amount: number) => void;
}

export default function BuyInModal({ visible, playerName, onClose, onAdd }: Props) {
  const [raw, setRaw] = useState('');

  const amount = parseFloat(raw);
  const isValid = !isNaN(amount) && amount > 0;

  const handleAdd = () => {
    if (!isValid) return;
    onAdd(amount);
    setRaw('');
  };

  const handleClose = () => {
    setRaw('');
    onClose();
  };

  const handleQuick = (val: number) => {
    onAdd(val);
    setRaw('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.box} onPress={() => {}}>
          <Text style={styles.title}>Buy In</Text>
          <Text style={styles.subtitle}>{playerName}</Text>

          <View style={styles.quickRow}>
            {QUICK_AMOUNTS.map((v) => (
              <TouchableOpacity key={v} style={styles.quickBtn} onPress={() => handleQuick(v)}>
                <Text style={styles.quickBtnText}>${v}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.input}
              placeholder="Custom amount"
              placeholderTextColor={Colors.textMuted}
              value={raw}
              onChangeText={setRaw}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={handleAdd}
            />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={handleClose}>
              <Text style={styles.btnCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnConfirm, !isValid && styles.btnDisabled]}
              onPress={handleAdd}
              disabled={!isValid}
            >
              <Text style={styles.btnConfirmText}>
                {isValid ? `Add ${`$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`}` : 'Add'}
              </Text>
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
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickBtn: {
    flex: 1,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickBtnText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  dollarSign: {
    color: Colors.textSecondary,
    fontSize: 18,
    fontWeight: '700',
    marginRight: 4,
  },
  input: {
    flex: 1,
    padding: 14,
    paddingLeft: 0,
    color: Colors.text,
    fontSize: 20,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
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
    fontSize: 16,
    fontWeight: '600',
  },
  btnConfirm: {
    backgroundColor: Colors.green,
  },
  btnConfirmText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.4,
  },
});
