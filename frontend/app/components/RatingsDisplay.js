import React from 'react';
import { View, Text } from 'react-native';
import { Octicons } from '@expo/vector-icons';
import { getTailwindColor } from '../utils/getTailwindColor';

const LEGACY_STAR_SIZE = 24;
const SUMMARY_STAR_SIZE = 14;

/**
 * @param {number} [rating] — Average score (legacy: rounded to 5 stars only). Summary: shown to one decimal with reviewCount.
 * @param {number} [reviewCount] — When set (including 0), enables summary row: empty state, stars + "4.0 (12)".
 * @param {string} [color] — Legacy: tailwind color path for all stars. Summary: overrides filled star color only.
 * @param {string} [contentClassName] — Row alignment (e.g. justify-start).
 * @param {string} [emptyLabel] — Summary-only copy when there are no reviews.
 * @param {string} [emptyClassName] — Summary-only styles for empty state.
 * @param {string} [scoreClassName] — Summary-only styles for the numeric line.
 * @param {number} [starSize] — Optional pixel size for star icons (both modes).
 */
export default function RatingsDisplay({
    rating,
    reviewCount,
    color,
    contentClassName = 'justify-center',
    emptyLabel = 'No reviews yet',
    emptyClassName = 'text-xs text-stone-500 dark:text-stone-400 italic',
    scoreClassName = 'text-sm text-stone-500 dark:text-stone-400 ml-1',
    starSize,
}) {
    const summaryMode = reviewCount !== undefined && reviewCount !== null;

    if (summaryMode) {
        const count = Number(reviewCount);
        const avg = rating != null && rating !== '' ? Number(rating) : NaN;
        const hasReviews =
            count > 0 && !Number.isNaN(avg) && avg > 0;

        if (!hasReviews) {
            return (
                <View className={`flex-row items-center ${contentClassName}`}>
                    <Text className={emptyClassName}>{emptyLabel}</Text>
                </View>
            );
        }

        const filled = Math.min(5, Math.max(0, Math.round(avg)));
        const size = starSize ?? SUMMARY_STAR_SIZE;
        const fillColor = color
            ? getTailwindColor(color)
            : getTailwindColor('rating.starFilled');
        const emptyStarColor = getTailwindColor('rating.starEmpty');

        return (
            <View className={`flex-row items-center flex-wrap gap-0.5 ${contentClassName}`}>
                {Array.from({ length: filled }, (_, index) => (
                    <Octicons
                        key={`sf-${index}`}
                        name="star-fill"
                        size={size}
                        color={fillColor}
                    />
                ))}
                {Array.from({ length: 5 - filled }, (_, index) => (
                    <Octicons
                        key={`se-${index}`}
                        name="star"
                        size={size}
                        color={emptyStarColor}
                    />
                ))}
                <Text className={scoreClassName}>
                    {avg.toFixed(1)} ({count})
                </Text>
            </View>
        );
    }

    const rounded = Math.round(Number(rating) || 0);
    const size = starSize ?? LEGACY_STAR_SIZE;
    const starColor = color ? getTailwindColor(color) : getTailwindColor('primary.300');

    return (
        <View className={`flex-row items-center pt-2 ${contentClassName}`}>
            {Array.from({ length: rounded }, (_, index) => (
                <Octicons
                    key={`lf-${index}`}
                    name="star-fill"
                    size={size}
                    color={starColor}
                />
            ))}
            {Array.from({ length: 5 - rounded }, (_, index) => (
                <Octicons
                    key={`le-${index}`}
                    name="star"
                    size={size}
                    color={starColor}
                />
            ))}
        </View>
    );
}
