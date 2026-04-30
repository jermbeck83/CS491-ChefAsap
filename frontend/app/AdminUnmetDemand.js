import { useEffect, useState } from 'react';
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

export default function AdminUnmetDemandScreen() {
    const router = useRouter();
    const { token } = useAuth();
    const { apiUrl } = getEnvVars();

    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState([]);
    const [error, setError] = useState(null);

    const fetchUnmetDemand = async () => {
        if (!token) return;
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${apiUrl}/metrics/unmet-demand`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error || 'Failed to load unmet demand metrics.');
            }
            setRows(Array.isArray(data?.data) ? data.data : []);
        } catch (err) {
            setError(err.message || 'Network error while loading metrics.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUnmetDemand();
    }, [token]);

    return (
        <ScrollView style={s.screen} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <View style={s.headerCard}>
                <Text style={s.title}>Unmet Demand Dashboard</Text>
                <Text style={s.subtitle}>ZIPs where searches happen but no chefs are being matched.</Text>
            </View>

            <View style={s.card}>
                <View style={s.sectionHeader}>
                    <Octicons name="graph" size={18} color={GREEN} style={{ marginRight: 8 }} />
                    <Text style={s.sectionTitle}>Missed Opportunities by Location</Text>
                </View>
                <View style={s.sectionBody}>
                    {loading ? (
                        <LoadingIcon icon="spinner" message="Loading unmet demand metrics..." />
                    ) : error ? (
                        <View>
                            <Text style={s.errorText}>{error}</Text>
                            <TouchableOpacity style={s.retryBtn} onPress={fetchUnmetDemand}>
                                <Text style={s.retryText}>Retry</Text>
                            </TouchableOpacity>
                        </View>
                    ) : rows.length === 0 ? (
                        <Text style={s.emptyText}>No unmet demand hotspots right now.</Text>
                    ) : (
                        rows.map((item, index) => (
                            <View key={`${item.location_name}-${index}`} style={s.row}>
                                <View style={s.rowLeft}>
                                    <View style={s.iconBubble}>
                                        <Octicons name="location" size={16} color={GREEN} />
                                    </View>
                                    <Text style={s.locationName}>{item.location_name || 'Unknown location'}</Text>
                                </View>
                                <View style={s.metricPill}>
                                    <Text style={s.metricValue}>{Number(item.missed_opportunities || 0)}</Text>
                                </View>
                            </View>
                        ))
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
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#f8faf8', borderWidth: 1, borderColor: BORDER, borderRadius: 12,
        padding: 12, marginBottom: 10,
    },
    rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
    iconBubble: {
        width: 30, height: 30, borderRadius: 15, backgroundColor: GREEN_LIGHT,
        alignItems: 'center', justifyContent: 'center', marginRight: 10,
    },
    locationName: { fontSize: 15, fontWeight: '600', color: TEXT_MID, flexShrink: 1 },
    metricPill: {
        backgroundColor: GREEN_LIGHT, borderWidth: 1, borderColor: GREEN,
        borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12,
    },
    metricValue: { fontSize: 14, fontWeight: '800', color: GREEN },
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
