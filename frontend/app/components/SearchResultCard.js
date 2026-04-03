import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Octicons from '@expo/vector-icons/Octicons';

import getEnvVars from "../../config";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../providers/ThemeProvider";
import { getTailwindColor } from '../utils/getTailwindColor';

import ProfilePicture from './ProfilePicture';
import RatingsDisplay from './RatingsDisplay';

function formatDistance(miles) {
    if (miles == null || miles === '') return '—';
    const n = Number(miles);
    if (Number.isNaN(n)) return '—';
    return `${n.toFixed(1)} mi`;
}

export default function SearchResultCard({
    chef_id,
    first_name,
    last_name,
    distance,
    cuisine,
    timing,
    average_rating,
    review_count,
    hourly_rate,
}) {
    const [photoData, setPhotoData] = useState(null);
    const { token } = useAuth();
    const router = useRouter();
    const { manualTheme } = useTheme();

    const { apiUrl } = getEnvVars();
    const [loading, setLoading] = useState(true);

    const mutedIconColor = manualTheme === 'light'
        ? getTailwindColor('base.200')
        : getTailwindColor('base.dark.200');

    const handleChefPress = () => {
        router.push({
            pathname: `/ChefProfileScreen/${chef_id}`,
            params: {
                distance: distance,
            }
        });
    };

    useEffect(() => {
        const fetchPhoto = async () => {
            if (!chef_id) return;

            setLoading(true);

            try {
                const url = `${apiUrl}/profile/chef/${chef_id}/photo`;

                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                });

                const data = await response.json();

                if (response.ok) {
                    setPhotoData(data.photo_url);
                } else {
                    alert('Error', data.error || 'Failed to load profile picture.');
                }
            } catch (err) {
                alert('Error: ' + (err.message || 'Network error. Could not connect to API.'));
            } finally {
                setLoading(false);
            }
        };

        fetchPhoto();
    }, [chef_id]);

    const cuisineLine = Array.isArray(cuisine) && cuisine.length > 0
        ? cuisine.filter(Boolean).join(' · ')
        : null;

    const timings = Array.isArray(timing) ? timing.filter(Boolean) : [];

    const rateNum = hourly_rate != null ? Number(hourly_rate) : null;
    const showRate = rateNum != null && !Number.isNaN(rateNum);

    return (
        <Pressable
            onPress={handleChefPress}
            className="bg-white dark:bg-base-dark-100 rounded-xl mb-4 border border-primary-200/90 dark:border-dark-300 overflow-hidden active:opacity-90"
        >

            <View className="px-4 pt-4 pb-3">
                <View className="flex-row items-center gap-3">
                    {loading ? (
                        <View className="rounded-full bg-primary-100 dark:bg-dark-100 items-center justify-center"
                            style={{ width: 48, height: 48 }}>
                            <ActivityIndicator
                                size="small"
                                color={manualTheme === 'light' ? getTailwindColor('primary.400') : getTailwindColor('dark.400')}
                            />
                        </View>
                    ) : (
                        <ProfilePicture
                            photoUrl={photoData}
                            firstName={first_name}
                            lastName={last_name}
                            size={12}
                        />
                    )}

                    <View className="flex-1 min-w-0 pt-0.5">
                        <View className="flex-row items-center justify-between gap-2">
                            <Text
                                numberOfLines={1}
                                className="text-lg font-bold text-primary-400 dark:text-dark-400 shrink"
                                style={{ flex: 1, minWidth: 0 }}
                            >
                                {first_name} {last_name}
                            </Text>
                            <View className="flex-row items-center gap-0.5 shrink-0">
                                <Octicons name="location" size={14} color={mutedIconColor} />
                                <Text className="text-sm text-base-200 dark:text-base-dark-200">
                                    {formatDistance(distance)}
                                </Text>
                            </View>
                        </View>

                        {cuisineLine ? (
                            <Text
                                numberOfLines={2}
                                className="text-sm text-base-200 dark:text-base-dark-200 mt-1 leading-5"
                            >
                                {cuisineLine}
                            </Text>
                        ) : null}
                    </View>
                </View>

                {timings.length > 0 ? (
                    <View className="flex-row flex-wrap gap-2 mt-3 pl-[60px]">
                        {timings.map((label, index) => (
                            <View
                                key={`${label}-${index}`}
                                className="bg-primary-100 dark:bg-dark-100 px-2.5 py-1 rounded-full"
                            >
                                <Text className="text-xs font-semibold text-primary-400 dark:text-dark-400">
                                    {label}
                                </Text>
                            </View>
                        ))}
                    </View>
                ) : null}
            </View>

            <View className="border-t border-primary-200/70 dark:border-dark-300 bg-primary-100/35 dark:bg-dark-100/50 px-4 py-3 flex-row items-center justify-between gap-3">
                <RatingsDisplay
                    rating={average_rating}
                    reviewCount={review_count ?? 0}
                    contentClassName="justify-start"
                />
                {showRate ? (
                    <Text className="text-sm font-bold text-primary-400 dark:text-dark-400 shrink-0">
                        from ${Math.round(rateNum)}/hr
                    </Text>
                ) : (
                    <Text className="text-sm font-semibold text-primary-400 dark:text-dark-400 shrink-0">
                        View
                    </Text>
                )}
            </View>
        </Pressable>
    );
}
