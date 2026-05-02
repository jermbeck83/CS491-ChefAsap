/**
 * CustomerBookingTimePicker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in time-picker patch for your customer checkout / booking screen.
 *
 * HOW TO INTEGRATE
 * ────────────────
 * 1. Copy this file into app/components/CustomerBookingTimePicker.js
 * 2. In your checkout screen, replace however you currently render the time
 *    picker with:
 *
 *      import CustomerBookingTimePicker from './components/CustomerBookingTimePicker';
 *
 *      <CustomerBookingTimePicker
 *          cartItems={cartItems}          // array of items in the cart, each with meal_type
 *          selectedTime={bookingTime}     // Date object
 *          onTimeChange={setBookingTime}  // setter
 *      />
 *
 * 3. Before submitting the booking, call:
 *
 *      import { getCartConflicts } from '../utils/mealTimeUtils';
 *
 *      const conflicts = getCartConflicts(cartItems, bookingTime);
 *      if (conflicts.length > 0) {
 *          Alert.alert(
 *              'Meal Time Mismatch',
 *              conflicts.map(c => `• ${c.item.dish_name} must be booked during ${c.mealType} (${c.allowedLabel})`).join('\n')
 *          );
 *          return;
 *      }
 *      // proceed with booking...
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useMemo, useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { getAllowedHours, getCartConflicts, MEAL_TIME_WINDOWS } from '../../utils/mealTimeUtils';

const GREEN      = '#2d6a4f';
const GREEN_LIGHT= '#d8f3dc';
const BORDER     = '#e2ece2';
const TEXT       = '#1a2e1a';
const TEXT_MID   = '#4a7c59';
const TEXT_SOFT  = '#8aab8a';
const WARN_BG    = '#fef9c3';
const WARN_TEXT  = '#92400e';
const ERR_BG     = '#fee2e2';
const ERR_TEXT   = '#991b1b';

/**
 * Derive the union of allowed hours across ALL items in the cart.
 * If items have conflicting meal types (e.g. Breakfast + Dinner), the set
 * is empty and the conflict banner is shown instead of disabling hours.
 */
function getCartAllowedHours(cartItems) {
    if (!cartItems?.length) return Array.from({ length: 24 }, (_, i) => i);

    const restrictedItems = cartItems.filter(
        item => item.meal_type && item.meal_type !== 'Any'
    );
    if (!restrictedItems.length) return Array.from({ length: 24 }, (_, i) => i);

    // Intersect windows across all restricted items
    let allowedSet = null;
    restrictedItems.forEach(item => {
        const hours = new Set(getAllowedHours(item.meal_type));
        if (allowedSet === null) {
            allowedSet = hours;
        } else {
            allowedSet = new Set([...allowedSet].filter(h => hours.has(h)));
        }
    });

    return allowedSet ? [...allowedSet].sort((a, b) => a - b) : [];
}

function formatHour12(hour) {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 || 12;
    return `${h}:00 ${ampm}`;
}

function pad(n) { return n < 10 ? `0${n}` : String(n); }

export default function CustomerBookingTimePicker({ cartItems, selectedTime, onTimeChange }) {
    const [selectedHour, setSelectedHour] = useState(
        selectedTime instanceof Date ? selectedTime.getHours() : 12
    );
    const [selectedMinute, setSelectedMinute] = useState(
        selectedTime instanceof Date ? selectedTime.getMinutes() : 0
    );

    const allowedHours = useMemo(() => getCartAllowedHours(cartItems), [cartItems]);
    const hasIntersection = allowedHours.length > 0;

    // Distinct meal types in cart (for the hint banner)
    const mealTypes = useMemo(() => {
        const types = new Set(
            (cartItems || [])
                .map(i => i.meal_type)
                .filter(t => t && t !== 'Any')
        );
        return [...types];
    }, [cartItems]);

    // Conflict: multiple incompatible meal types in the same cart
    const hasCartConflict = mealTypes.length > 1 && !hasIntersection;

    const handleHourSelect = (hour) => {
        if (!allowedHours.includes(hour)) return; // blocked
        setSelectedHour(hour);

        const newDate = selectedTime instanceof Date ? new Date(selectedTime) : new Date();
        newDate.setHours(hour, selectedMinute, 0, 0);
        onTimeChange?.(newDate);
    };

    const handleMinuteSelect = (min) => {
        setSelectedMinute(min);
        const newDate = selectedTime instanceof Date ? new Date(selectedTime) : new Date();
        newDate.setHours(selectedHour, min, 0, 0);
        onTimeChange?.(newDate);
    };

    return (
        <View style={s.container}>
            <Text style={s.label}>Select Time</Text>

            {/* ── Meal-type hint banner ── */}
            {mealTypes.length > 0 && !hasCartConflict ? (
                <View style={s.hintBanner}>
                    <Text style={s.hintText}>
                        {mealTypes.length === 1
                            ? `Your cart contains ${mealTypes[0]} items — only ${MEAL_TIME_WINDOWS[mealTypes[0]]?.label} hours are available.`
                            : `Your cart mixes meal types: ${mealTypes.join(' & ')}. Grayed hours are unavailable for one or more items.`
                        }
                    </Text>
                </View>
            ) : null}

            {/* ── Cart conflict warning ── */}
            {hasCartConflict ? (
                <View style={s.errorBanner}>
                    <Text style={s.errorText}>
                        ⚠️ Your cart contains items from incompatible meal times ({mealTypes.join(' & ')}).
                        Please remove conflicting items before booking.
                    </Text>
                </View>
            ) : null}

            {/* ── Hour grid ── */}
            <Text style={s.subLabel}>Hour</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={s.hourGrid}>
                    {Array.from({ length: 18 }, (_, i) => i + 6).map(hour => {
                        const isAllowed = allowedHours.includes(hour);
                        const isSelected = selectedHour === hour;
                        return (
                            <TouchableOpacity
                                key={hour}
                                onPress={() => handleHourSelect(hour)}
                                disabled={!isAllowed}
                                activeOpacity={0.75}
                                style={[
                                    s.hourBtn,
                                    isSelected && s.hourBtnSelected,
                                    !isAllowed && s.hourBtnDisabled,
                                ]}
                            >
                                <Text style={[
                                    s.hourBtnText,
                                    isSelected && s.hourBtnTextSelected,
                                    !isAllowed && s.hourBtnTextDisabled,
                                ]}>
                                    {formatHour12(hour)}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>

            {/* ── Minute selector ── */}
            <Text style={s.subLabel}>Minute</Text>
            <View style={s.minuteRow}>
                {[0, 15, 30, 45].map(min => {
                    const isSelected = selectedMinute === min;
                    return (
                        <TouchableOpacity
                            key={min}
                            onPress={() => handleMinuteSelect(min)}
                            activeOpacity={0.75}
                            style={[s.minBtn, isSelected && s.minBtnSelected]}
                        >
                            <Text style={[s.minBtnText, isSelected && s.minBtnTextSelected]}>
                                {pad(min)}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* ── Selected time display ── */}
            <View style={s.selectedDisplay}>
                <Text style={s.selectedDisplayText}>
                    {`Selected: ${formatHour12(selectedHour).replace(':00', '')}:${pad(selectedMinute)} ${selectedHour >= 12 ? 'PM' : 'AM'}`}
                </Text>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container: { marginBottom: 16 },
    label: { fontSize: 14, fontWeight: '700', color: TEXT_MID, marginBottom: 8 },
    subLabel: { fontSize: 12, fontWeight: '600', color: TEXT_SOFT, marginBottom: 6 },

    hintBanner: {
        backgroundColor: WARN_BG, borderRadius: 10,
        padding: 10, marginBottom: 10,
    },
    hintText: { fontSize: 12, color: WARN_TEXT, lineHeight: 17 },

    errorBanner: {
        backgroundColor: ERR_BG, borderRadius: 10,
        padding: 10, marginBottom: 10,
    },
    errorText: { fontSize: 12, color: ERR_TEXT, lineHeight: 17 },

    hourGrid: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
    hourBtn: {
        paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: 10, borderWidth: 1.5, borderColor: BORDER,
        backgroundColor: '#fff',
    },
    hourBtnSelected: { backgroundColor: GREEN, borderColor: GREEN },
    hourBtnDisabled: { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb', opacity: 0.5 },
    hourBtnText: { fontSize: 13, fontWeight: '600', color: TEXT },
    hourBtnTextSelected: { color: '#fff' },
    hourBtnTextDisabled: { color: '#9ca3af' },

    minuteRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    minBtn: {
        flex: 1, paddingVertical: 10, borderRadius: 10,
        borderWidth: 1.5, borderColor: BORDER, backgroundColor: '#fff',
        alignItems: 'center',
    },
    minBtnSelected: { backgroundColor: GREEN, borderColor: GREEN },
    minBtnText: { fontSize: 14, fontWeight: '600', color: TEXT },
    minBtnTextSelected: { color: '#fff' },

    selectedDisplay: {
        backgroundColor: GREEN_LIGHT, borderRadius: 10,
        padding: 12, alignItems: 'center',
    },
    selectedDisplayText: { fontSize: 15, fontWeight: '700', color: GREEN },
});