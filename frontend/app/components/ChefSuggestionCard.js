import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Octicons from '@expo/vector-icons/Octicons';
import ProfilePicture from './ProfilePicture';

const GREEN = '#2d6a4f';
const GREEN_LIGHT = '#d8f3dc';
const BORDER = '#e2ece2';
const TEXT = '#1a2e1a';
const TEXT_MID = '#4a7c59';
const TEXT_SOFT = '#8aab8a';

export default function ChefSuggestionCard({ chef }) {
    const router = useRouter();

    const {
        chef_id,
        first_name,
        last_name,
        full_name,
        photo_url,
        rating,
        match_reason,
        cuisines = [],
        distance_miles,
    } = chef;

    const displayName = full_name ?? `${first_name ?? ''} ${last_name ?? ''}`.trim() ?? `Chef #${chef_id}`;
    const avgRating = rating?.average_rating ?? rating ?? null;
    const cuisineLabel = Array.isArray(cuisines) ? cuisines.slice(0, 2).join(', ') : cuisines;

    return (
        <View style={s.card}>
            <View style={s.left}>
                <ProfilePicture
                    size={11}
                    photoUrl={photo_url}
                    firstName={first_name}
                    lastName={last_name}
                />
            </View>

            <View style={s.mid}>
                <Text style={s.name} numberOfLines={1}>{displayName}</Text>

                <View style={s.metaRow}>
                    {avgRating != null && (
                        <View style={s.ratingPill}>
                            <Octicons name="star-fill" size={11} color="#eab308" />
                            <Text style={s.ratingText}>{Number(avgRating).toFixed(1)}</Text>
                        </View>
                    )}
                    {cuisineLabel ? (
                        <Text style={s.cuisine} numberOfLines={1}>{cuisineLabel}</Text>
                    ) : null}
                    {distance_miles != null && (
                        <Text style={s.distance}>{Number(distance_miles).toFixed(1)} mi</Text>
                    )}
                </View>

                {match_reason ? (
                    <Text style={s.matchReason} numberOfLines={2}>{match_reason}</Text>
                ) : null}
            </View>

            <TouchableOpacity
                style={s.viewBtn}
                onPress={() => router.push(`/ChefProfileScreen/${chef_id}`)}
                activeOpacity={0.8}
            >
                <Text style={s.viewBtnText}>View</Text>
                <Octicons name="arrow-right" size={12} color={GREEN} />
            </TouchableOpacity>
        </View>
    );
}

const s = StyleSheet.create({
    card: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: '#f0f5f0',
        gap: 10,
    },
    left: {},
    mid: { flex: 1 },
    name: { fontSize: 13, fontWeight: '700', color: TEXT, marginBottom: 3 },
    metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 3 },
    ratingPill: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: '#fef9c3', borderRadius: 8,
        paddingHorizontal: 6, paddingVertical: 2,
    },
    ratingText: { fontSize: 11, fontWeight: '700', color: '#854d0e' },
    cuisine: { fontSize: 12, color: TEXT_SOFT },
    distance: { fontSize: 12, color: TEXT_SOFT },
    matchReason: { fontSize: 12, color: TEXT_MID, lineHeight: 16, fontStyle: 'italic' },
    viewBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: GREEN_LIGHT, borderWidth: 1.5, borderColor: GREEN,
        borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    },
    viewBtnText: { fontSize: 12, fontWeight: '700', color: GREEN },
});