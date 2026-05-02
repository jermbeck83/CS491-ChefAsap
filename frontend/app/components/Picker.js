import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet, Pressable } from 'react-native';
import { Octicons } from '@expo/vector-icons';

const GREEN    = '#2d6a4f';
const GREEN_LIGHT = '#d8f3dc';
const BORDER   = '#e2ece2';
const TEXT     = '#1a2e1a';
const TEXT_MID = '#4a7c59';
const TEXT_SOFT= '#8aab8a';
const BG       = '#fefce8';

/**
 * CustomPicker — single OR multi-select bottom-sheet picker.
 *
 * Single (default):
 *   selectedValue={string | null}   onValueChange={(val) => …}
 *
 * Multi:
 *   isMulti={true}
 *   selectedValue={string[]}        onValueChange={(arr) => …}
 */
export default function CustomPicker({
    label,
    prompt,
    selectedValue,
    onValueChange,
    items = [],
    isMulti = false,
    // legacy — accepted, ignored
    labelStyle,
    customClass,
}) {
    const [open, setOpen] = useState(false);

    // ── display text ─────────────────────────────────────────────────────────
    const displayLabel = () => {
        if (isMulti) {
            const sel = Array.isArray(selectedValue) ? selectedValue : [];
            if (!sel.length) return prompt || 'Select...';
            if (sel.length === 1) return items.find(i => i.value === sel[0])?.label || prompt;
            return sel.length + ' selected';
        }
        const found = items.find(i => i.value === selectedValue);
        return found?.value != null ? found.label : (prompt || 'Select...');
    };

    const isEmpty = isMulti
        ? !Array.isArray(selectedValue) || selectedValue.length === 0
        : items.find(i => i.value === selectedValue)?.value == null;

    // ── selection handlers ───────────────────────────────────────────────────
    const pickSingle = (val) => { onValueChange(val); setOpen(false); };

    const toggleMulti = (val) => {
        if (val == null) return;
        const cur  = Array.isArray(selectedValue) ? selectedValue : [];
        const next = cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val];
        onValueChange(next);
    };

    const isChosen = (val) => isMulti
        ? (Array.isArray(selectedValue) ? selectedValue : []).includes(val)
        : val === selectedValue;

    const visibleItems = isMulti ? items.filter(i => i.value != null) : items;

    return (
        <View style={s.wrapper}>
            {label ? <Text style={s.label}>{label}</Text> : null}

            {/* Trigger button */}
            <TouchableOpacity style={s.trigger} onPress={() => setOpen(true)} activeOpacity={0.75}>
                <Text style={[s.triggerTxt, isEmpty && s.placeholder]} numberOfLines={1}>
                    {displayLabel()}
                </Text>
                <Octicons name="chevron-down" size={14} color={TEXT_SOFT} />
            </TouchableOpacity>

            {/* Chips for multi */}
            {isMulti && Array.isArray(selectedValue) && selectedValue.length > 0 ? (
                <View style={s.chipRow}>
                    {selectedValue.map(val => {
                        const found = items.find(i => i.value === val);
                        if (!found) return null;
                        return (
                            <TouchableOpacity key={val} style={s.chip} onPress={() => toggleMulti(val)} activeOpacity={0.7}>
                                <Text style={s.chipTxt}>{found.label}</Text>
                                <Octicons name="x" size={11} color={GREEN} style={{ marginLeft: 4 }} />
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ) : null}

            {/* Bottom sheet modal */}
            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <Pressable style={s.overlay} onPress={() => setOpen(false)} />
                <View style={s.sheet}>
                    <View style={s.sheetHead}>
                        <Text style={s.sheetTitle}>{label || prompt || 'Select'}</Text>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                            {isMulti ? (
                                <TouchableOpacity style={s.doneBtn} onPress={() => setOpen(false)}>
                                    <Text style={s.doneTxt}>Done</Text>
                                </TouchableOpacity>
                            ) : null}
                            <TouchableOpacity style={s.closeBtn} onPress={() => setOpen(false)}>
                                <Octicons name="x" size={15} color={GREEN} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <FlatList
                        data={visibleItems}
                        keyExtractor={(_, i) => String(i)}
                        ItemSeparatorComponent={() => <View style={s.sep} />}
                        renderItem={({ item }) => {
                            const chosen  = isChosen(item.value);
                            const isNone  = item.value == null;
                            return (
                                <TouchableOpacity
                                    style={[s.option, chosen && s.optionOn]}
                                    onPress={() => isMulti ? toggleMulti(item.value) : pickSingle(item.value)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[s.optionTxt, isNone && s.optionNone, chosen && s.optionTxtOn]}>
                                        {item.label}
                                    </Text>
                                    {isMulti ? (
                                        <View style={[s.box, chosen && s.boxOn]}>
                                            {chosen ? <Octicons name="check" size={12} color="#fff" /> : null}
                                        </View>
                                    ) : (
                                        chosen ? <Octicons name="check" size={15} color={GREEN} /> : null
                                    )}
                                </TouchableOpacity>
                            );
                        }}
                    />
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    wrapper:     { flex: 1, marginRight: 8, marginBottom: 12 },
    label:       { fontSize: 12, fontWeight: '700', color: TEXT_MID, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
    trigger:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, backgroundColor: '#fff', minHeight: 46 },
    triggerTxt:  { fontSize: 14, fontWeight: '600', color: TEXT, flex: 1, marginRight: 8 },
    placeholder: { color: TEXT_SOFT, fontWeight: '400' },
    chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    chip:        { flexDirection: 'row', alignItems: 'center', backgroundColor: GREEN_LIGHT, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: BORDER },
    chipTxt:     { fontSize: 12, fontWeight: '600', color: GREEN },
    overlay:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet:       { position: 'absolute', left: 16, right: 16, bottom: 32, backgroundColor: '#fff', borderRadius: 20, maxHeight: 400, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10, overflow: 'hidden' },
    sheetHead:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: BG },
    sheetTitle:  { fontSize: 15, fontWeight: '700', color: TEXT },
    doneBtn:     { backgroundColor: GREEN, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
    doneTxt:     { fontSize: 13, fontWeight: '700', color: '#fff' },
    closeBtn:    { width: 28, height: 28, borderRadius: 14, backgroundColor: GREEN_LIGHT, alignItems: 'center', justifyContent: 'center' },
    option:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#fff' },
    optionOn:    { backgroundColor: '#f0faf4' },
    optionTxt:   { fontSize: 15, color: TEXT, fontWeight: '500', flex: 1 },
    optionNone:  { color: TEXT_SOFT, fontWeight: '400' },
    optionTxtOn: { color: GREEN, fontWeight: '700' },
    sep:         { height: 1, backgroundColor: BORDER, marginHorizontal: 18 },
    box:         { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: BORDER, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    boxOn:       { backgroundColor: GREEN, borderColor: GREEN },
});