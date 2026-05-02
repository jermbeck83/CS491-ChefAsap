import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, Alert, Platform, StyleSheet, KeyboardAvoidingView } from 'react-native';
import { CardField, useStripe } from '@stripe/stripe-react-native';
import getEnvVars from '../../config';

const GREEN = '#2d6a4f';
const GREEN_LIGHT = '#d8f3dc';
const BORDER = '#e2ece2';
const TEXT = '#1a2e1a';
const TEXT_SOFT = '#8aab8a';

const AddCardModal = ({ visible, onClose, onSuccess, customerId }) => {
  const { createPaymentMethod } = useStripe();
  const [loading, setLoading] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const { apiUrl } = getEnvVars();

  const handleAddCard = async () => {
    if (!cardComplete) { Alert.alert('Error', 'Please fill in complete card information'); return; }
    setLoading(true);
    try {
      const { paymentMethod, error } = await createPaymentMethod({ paymentMethodType: 'Card' });
      if (error) { Alert.alert('Error', error.message || 'Unable to create payment method'); return; }
      if (!paymentMethod) { Alert.alert('Error', 'Unable to get payment method'); return; }

      const response = await fetch(`${apiUrl}/stripe-payment/attach-payment-method`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, payment_method_id: paymentMethod.id }),
      });

      const responseText = await response.text();
      let data;
      try { data = JSON.parse(responseText); }
      catch (e) { throw new Error('Server returned invalid response.'); }

      if (!response.ok) throw new Error(data.error || 'Failed to add card');

      Alert.alert('Success', 'Card added successfully!', [{ text: 'OK', onPress: () => { onSuccess && onSuccess(); onClose(); } }]);
    } catch (error) {
      Alert.alert('Error', error.message || 'An error occurred while adding card');
    } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.handle} />
          <View style={s.header}>
            <Text style={s.title}>Add Bank Card</Text>
            <TouchableOpacity onPress={onClose} disabled={loading} style={s.closeBtn}>
              <Text style={s.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <CardField
            postalCodeEnabled={false}
            placeholder={{ number: '4242 4242 4242 4242' }}
            cardStyle={{
              backgroundColor: '#f8faf8',
              textColor: TEXT,
              borderWidth: 1.5,
              borderColor: BORDER,
              borderRadius: 12,
              placeholderColor: TEXT_SOFT,
            }}
            style={s.cardField}
            onCardChange={(cardDetails) => setCardComplete(cardDetails.complete)}
          />
          <Text style={s.helperText}>Test: 4242 4242 4242 4242 · Any future date · Any CVC</Text>

          <View style={s.btnRow}>
            <TouchableOpacity style={[s.btn, s.cancelBtn]} onPress={onClose} disabled={loading}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.addBtn, (!cardComplete || loading) && s.disabledBtn]}
              onPress={handleAddCard} disabled={!cardComplete || loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.addBtnText}>Add Card</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  card: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#dde8dd', alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '800', color: TEXT },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: GREEN_LIGHT, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 16, color: GREEN, fontWeight: '600' },
  cardField: { width: '100%', height: 54, marginBottom: 8 },
  helperText: { fontSize: 12, color: TEXT_SOFT, textAlign: 'center', marginBottom: 24 },
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { borderWidth: 1.5, borderColor: BORDER, backgroundColor: '#fff' },
  cancelBtnText: { color: '#4a7c59', fontSize: 15, fontWeight: '600' },
  addBtn: { backgroundColor: GREEN },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabledBtn: { backgroundColor: '#c8ddd0' },
});

export default AddCardModal;