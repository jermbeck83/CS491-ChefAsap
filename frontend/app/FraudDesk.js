import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Octicons } from '@expo/vector-icons';

import getEnvVars from '../config';
import { useAuth } from './context/AuthContext';
import LoadingIcon from './components/LoadingIcon';

const GREEN = '#2d6a4f';
const GREEN_LIGHT = '#d8f3dc';
const BG = '#fefce8';
const BORDER = '#e2ece2';
const TEXT = '#1a2e1a';
const TEXT_MID = '#4a7c59';
const TEXT_SOFT = '#8aab8a';

const FLAG_LABELS = {
    new_account: 'New Account',
    high_velocity: 'High Velocity',
    high_value: 'High Value',
    unusual_location: 'Unusual Location',
    rapid_retries: 'Rapid Retries',
};

const toNiceLabel = (value) => {
    if (!value) return 'Risk Flag';
    if (FLAG_LABELS[value]) return FLAG_LABELS[value];
    return String(value)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
};

const normalizeFlags = (flags) => {
    if (!flags) return [];
    if (Array.isArray(flags)) return flags.map(toNiceLabel);
    if (typeof flags === 'string') {
        try {
            const parsed = JSON.parse(flags);
            return normalizeFlags(parsed);
        } catch (_) {
            return [toNiceLabel(flags)];
        }
    }
    if (typeof flags === 'object') {
        return Object.entries(flags)
            .filter(([, enabled]) => Boolean(enabled))
            .map(([key]) => toNiceLabel(key));
    }
    return [];
};

export default function FraudDeskScreen() {
    const router = useRouter();
    const { token } = useAuth();
    const { apiUrl } = getEnvVars();

    const [loading, setLoading] = useState(true);
    const [bookings, setBookings] = useState([]);
    const [error, setError] = useState(null);

    const fetchRecentBookings = async () => {
        if (!token) return;
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${apiUrl}/metrics/recent-bookings`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (response.status === 403) {
                Alert.alert(
                    'Transaction Declined',
                    'Flagged for suspicious activity. Please contact support.'
                );
            }

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error || 'Failed to load recent bookings.');
            }
            const rows = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.bookings) ? data.bookings : []);
            setBookings(rows);
        } catch (err) {
            setError(err.message || 'Network error while loading fraud desk.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecentBookings();
    }, [token]);

    const flaggedBookings = useMemo(() => {
        return bookings.filter((booking) => Number(booking?.fraud_score || 0) > 0);
    }, [bookings]);

    return (
        <ScrollView style={s.screen} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <View style={s.headerCard}>
                <Text style={s.title}>Fraud Desk</Text>
                <Text style={s.subtitle}>Recent bookings with non-zero fraud score and translated risk badges.</Text>
            </View>

            <View style={s.card}>
                <View style={s.sectionHeader}>
                    <Octicons name="shield" size={18} color={GREEN} style={{ marginRight: 8 }} />
                    <Text style={s.sectionTitle}>Flagged Bookings</Text>
                </View>
                <View style={s.sectionBody}>
                    {loading ? (
                        <LoadingIcon icon="spinner" message="Loading fraud desk..." />
                    ) : error ? (
                        <View>
                            <Text style={s.errorText}>{error}</Text>
                            <TouchableOpacity style={s.retryBtn} onPress={fetchRecentBookings}>
                                <Text style={s.retryText}>Retry</Text>
                            </TouchableOpacity>
                        </View>
                    ) : flaggedBookings.length === 0 ? (
                        <Text style={s.emptyText}>No flagged bookings found.</Text>
                    ) : (
                        flaggedBookings.map((booking, index) => {
                            const badges = normalizeFlags(booking.fraud_flags);
                            return (
                                <View key={`${booking.booking_id || index}`} style={s.row}>
                                    <View style={s.rowTop}>
                                        <Text style={s.bookingLabel}>Booking #{booking.booking_id || 'N/A'}</Text>
                                        <Text style={s.scoreLabel}>Score: {Number(booking.fraud_score).toFixed(2)}</Text>
                                    </View>
                                    <View style={s.badgesWrap}>
                                        {badges.length > 0 ? badges.map((badge, badgeIndex) => (
                                            <View key={`${badge}-${badgeIndex}`} style={s.badge}>
                                                <Text style={s.badgeText}>{badge}</Text>
                                            </View>
                                        )) : (
                                            <View style={s.badge}>
                                                <Text style={s.badgeText}>Risk Flag</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            );
                        })
                    )}
                </View>
            </View>

            <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.85}>
                <Text style={s.backBtnText}>Back</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: BG },
    headerCard: {
        backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: BORDER,
        padding: 16, marginBottom: 14,
    },
    title: { fontSize: 22, fontWeight: '800', color: TEXT, letterSpacing: -0.5 },
    subtitle: { fontSize: 14, color: TEXT_SOFT, marginTop: 6, lineHeight: 20 },
    card: {
        backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: BORDER,
        marginBottom: 14, overflow: 'hidden',
    },
    sectionHeader: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: BORDER,
    },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: TEXT, flex: 1 },
    sectionBody: { padding: 14 },
    row: {
        backgroundColor: '#f8faf8', borderWidth: 1, borderColor: BORDER, borderRadius: 12,
        padding: 12, marginBottom: 10,
    },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    bookingLabel: { fontSize: 15, fontWeight: '700', color: TEXT_MID },
    scoreLabel: { fontSize: 13, fontWeight: '700', color: '#b45309' },
    badgesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    badge: {
        backgroundColor: '#ffedd5', borderWidth: 1, borderColor: '#fb923c',
        borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10,
    },
    badgeText: { fontSize: 12, color: '#9a3412', fontWeight: '700' },
    emptyText: { fontSize: 14, color: TEXT_SOFT, textAlign: 'center', paddingVertical: 12 },
    errorText: { fontSize: 14, color: '#b91c1c', textAlign: 'center', marginBottom: 12 },
    retryBtn: {
        borderWidth: 1.5, borderColor: GREEN, borderRadius: 10,
        paddingVertical: 10, alignItems: 'center',
    },
    retryText: { color: GREEN, fontWeight: '700', fontSize: 14 },
    backBtn: {
        backgroundColor: GREEN, borderRadius: 14, alignItems: 'center',
        paddingVertical: 14,
    },
    backBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
