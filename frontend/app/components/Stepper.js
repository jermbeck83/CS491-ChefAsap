import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';

const GREEN    = '#2d6a4f';
const GREEN_LIGHT = '#d8f3dc';
const BORDER   = '#e2ece2';
const TEXT     = '#1a2e1a';
const TEXT_MID = '#4a7c59';
const TEXT_SOFT= '#8aab8a';

export default function Stepper({
    label,
    value,
    onValueChange,
    min = 0,
    max = 100,
    step = 1,
    // legacy props — ignored
    labelStyle,
    size,
}) {
    const numericValue = Math.max(min, Number(value) || 0);
    const [inputText, setInputText]   = useState(String(numericValue));
    const [focused,   setFocused]     = useState(false);

    const clamp = (n) => Math.min(max, Math.max(min, n));

    const commit = (raw) => {
        const parsed  = parseInt(raw, 10);
        const clamped = isNaN(parsed) || parsed < min ? min : clamp(parsed);
        setInputText(String(clamped));
        onValueChange(clamped);
    };

    const atMin = numericValue <= min;
    const atMax = numericValue >= max;

    return (
        <View style={s.wrapper}>
            {label ? <Text style={s.label}>{label}</Text> : null}
            <View style={s.row}>
                <TouchableOpacity
                    style={[s.btn, atMin && s.btnOff]}
                    onPress={() => {
                        const next = clamp(numericValue - step);
                        setInputText(String(next));
                        onValueChange(next);
                    }}
                    disabled={atMin}
                    activeOpacity={0.7}
                >
                    <Text style={[s.btnTxt, atMin && s.btnTxtOff]}>−</Text>
                </TouchableOpacity>

                <TextInput
                    style={[s.input, focused && s.inputOn]}
                    value={focused ? inputText : String(numericValue)}
                    onChangeText={t => setInputText(t.replace(/[^0-9]/g, ''))}
                    onFocus={() => { setFocused(true); setInputText(''); }}
                    onBlur={() => { setFocused(false); commit(inputText); }}
                    keyboardType="number-pad"
                    maxLength={4}
                    selectTextOnFocus
                    returnKeyType="done"
                    onSubmitEditing={() => commit(inputText)}
                />

                <TouchableOpacity
                    style={[s.btn, atMax && s.btnOff]}
                    onPress={() => {
                        const next = clamp(numericValue + step);
                        setInputText(String(next));
                        onValueChange(next);
                    }}
                    disabled={atMax}
                    activeOpacity={0.7}
                >
                    <Text style={[s.btnTxt, atMax && s.btnTxtOff]}>+</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    wrapper:  { alignItems: 'center', flex: 1 },
    label:    { fontSize: 12, fontWeight: '700', color: TEXT_MID, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    row:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
    btn:      { width: 32, height: 32, borderRadius: 10, backgroundColor: GREEN_LIGHT, borderWidth: 1.5, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
    btnOff:   { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb' },
    btnTxt:   { fontSize: 16, fontWeight: '600', color: GREEN, lineHeight: 20, textAlign: 'center' },
    btnTxtOff:{ color: '#9ca3af' },
    input:    { width: 52, height: 32, borderRadius: 10, borderWidth: 1.5, borderColor: BORDER, backgroundColor: '#fff', textAlign: 'center', fontSize: 14, fontWeight: '700', color: TEXT },
    inputOn:  { borderColor: GREEN, backgroundColor: '#f0faf4' },
});