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

interface Props {
  visible: boolean;
  onClose: () => void;
  onAdd: (name: string) => void;
}

export default function AddPlayerModal({ visible, onClose, onAdd }: Props) {
  const [name, setName] = useState('');

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName('');
  };

  const handleClose = () => {
    setName('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.box} onPress={() => {}}>
          <Text style={styles.title}>Add Player</Text>
          <TextInput
            style={styles.input}
            placeholder="Player name"
            placeholderTextColor={Colors.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={30}
            onSubmitEditing={handleAdd}
            returnKeyType="done"
          />
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={handleClose}>
              <Text style={styles.btnCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnConfirm, !name.trim() && styles.btnDisabled]}
              onPress={handleAdd}
              disabled={!name.trim()}
            >
              <Text style={styles.btnConfirmText}>Add</Text>
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
    marginBottom: 16,
  },
  input: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 12,
    padding: 14,
    color: Colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
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
    backgroundColor: Colors.blue,
  },
  btnConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.4,
  },
});
