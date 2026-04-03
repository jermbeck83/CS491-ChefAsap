import React from 'react';
import { View } from 'react-native';
import { Octicons } from '@expo/vector-icons';
import getTailwindColor from '../utils/getTailwindColor';

export default function RatingsDisplay({
    rating,
    color,
    contentClassName = 'justify-center',
}) {
    rating = Math.round(rating);
    return (
        <View className={`flex-row items-center pt-2 ${contentClassName}`}>
            {Array.from({ length: rating }, (_, i) => i).map((index) =>
                <Octicons
                    key={index}
                    name={"star-fill"}
                    size={24}
                    color={color ? getTailwindColor(color) : "#65A30D"}
                />)}
            {Array.from({ length: 5 - rating }, (_, i) => i).map((index) =>
                <Octicons
                    key={index}
                    name={"star"}
                    size={24}
                    color={color ? getTailwindColor(color) : "#65A30D"}
                />)}
        </View>
    );
}