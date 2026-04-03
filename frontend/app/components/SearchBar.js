import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import Octicons from '@expo/vector-icons/Octicons';
import Button from './Button';
import Input from './Input';
import CustomPicker from './Picker';
import Stepper from './Stepper';
import LocationInput from './LocationInput';
import getEnvVars from '../../config';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../providers/ThemeProvider';
import { getTailwindColor } from '../utils/getTailwindColor';

const HEADER_BANNER_BOTTOM_RADIUS = 28;

const greenBannerBaseStyle = {
    width: '100%',
    borderWidth: 0,
};

export default function SearchBarComponent({ formData, setFormData, handleSearch }) {
    const [recentSearches, setRecentSearches] = useState([]);
    const [isDropVisible, setIsDropVisible] = useState(false);
    const { apiUrl } = getEnvVars();
    const { token, profileId } = useAuth();
    const { manualTheme } = useTheme();

    const greenHeaderStyle = useMemo(() => {
        const backgroundColor =
            manualTheme === 'light'
                ? getTailwindColor('primary.300')
                : getTailwindColor('dark.300');

        return [
            greenBannerBaseStyle,
            {
                backgroundColor,
                borderBottomLeftRadius: HEADER_BANNER_BOTTOM_RADIUS,
                borderBottomRightRadius: HEADER_BANNER_BOTTOM_RADIUS,
            },
            Platform.select({
                ios: {
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.08,
                    shadowRadius: 8,
                },
                android: {
                    elevation: 3,
                },
                default: {},
            }),
        ];
    }, [manualTheme]);

    // Fetch recent searches from API
    useEffect(() => {
        const fetchRecentSearches = async () => {
            if (!profileId || !token) return;

            try {
                const url = `${apiUrl}/search/recent/${profileId}?limit=3`;
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    // Transform API data to match the expected format
                    const formattedSearches = data.recent_searches.map(search => {
                        let query = search.search_query || search.cuisine || 'Recent search';
                        let type = 'chef';
                        
                        if (search.cuisine && !search.search_query) {
                            type = 'cuisine';
                        } else if (search.search_query) {
                            // Try to guess the type based on the query
                            type = 'chef';
                        }

                        return { 
                            query, 
                            type,
                            fullData: search // Keep full search data for re-executing search
                        };
                    });

                    setRecentSearches(formattedSearches);
                }
            } catch (err) {
                console.error('Failed to fetch recent searches:', err);
            }
        };

        fetchRecentSearches();
    }, [profileId, token, apiUrl]);

    const genderItems = [
        { label: "All", value: "all" },
        { label: "Male", value: "male" },
        { label: "Female", value: "female" },
    ];

    const timingItems = [
        { label: "All", value: "all" },
        { label: "Breakfast", value: "breakfast" },
        { label: "Lunch", value: "lunch" },
        { label: "Dinner", value: "dinner" },
    ];

    const searchOptions = [
        { label: "Chef", value: "chef" },
        { label: "Cuisine", value: "cuisine" },
        { label: "Dish", value: "dish" },
    ]

    const handlePrimarySearchChange = (value) => {
        setFormData(prev => ({ ...prev, searchQuery: value }));
    };

    const handleHistoryClick = (item) => {
        // Re-apply the full search parameters from history
        if (item.fullData) {
            setFormData(prev => ({
                ...prev,
                searchQuery: item.fullData.search_query || '',
                cuisine: item.fullData.cuisine || '',
                gender: item.fullData.gender || 'all',
                timing: item.fullData.meal_timing || 'all',
                min_rating: item.fullData.min_rating || 0,
                max_price: item.fullData.max_price || 500,
                radius: item.fullData.radius || 10,
                latitude: item.fullData.latitude || prev.latitude,
                longitude: item.fullData.longitude || prev.longitude,
                locationDisplayLine: '',
                locationPostalCode: '',
            }));
        } else {
            // Fallback to just setting query and type
            setFormData(prev => ({ ...prev, searchQuery: item.query, searchType: item.type }));
        }
    };

    const renderDropView = () => (
        <View className="w-full bg-white dark:bg-base-dark-100 rounded-2xl p-3 pb-0">
            <View className="flex-row">
                <CustomPicker
                    label="Search By"
                    prompt="Select what to search by"
                    selectedValue={formData.searchType}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, searchType: v }))}
                    items={searchOptions}
                    labelStyle='text-center'
                />
                <Stepper
                    label="Search Radius"
                    value={formData.radius}
                    onValueChange={(newValue) => setFormData(prev => ({ ...prev, radius: newValue }))}
                    min={5}
                    max={30}
                    step={5}
                    labelStyle='text-center'
                />
            </View>

            <View className="flex-row">
                <CustomPicker
                    label="Meal Timing"
                    prompt="Select Mealtime"
                    selectedValue={formData.timing}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, timing: v }))}
                    items={timingItems}
                    labelStyle='text-center'
                />
                <CustomPicker
                    label="Chef Gender"
                    prompt="Select Gender"
                    selectedValue={formData.gender}
                    onValueChange={(v) => setFormData(prev => ({ ...prev, gender: v }))}
                    items={genderItems}
                    labelStyle='text-center'
                />
            </View>
            
            <View>
                <Text className="text-sm font-semibold text-primary-400 mb-1 mt-4 text-center dark:text-dark-400">Recent Searches</Text>
                {recentSearches.length > 0 ? (
                    <View className="rounded-lg border border-gray-100">
                        {recentSearches.map((item, index) => (
                            <TouchableOpacity key={index} onPress={() => handleHistoryClick(item)} className="p-2 border-b border-gray-100 rounded-lg">
                                <Text className="text-base text-warm-gray">{item.query} ({item.type})</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                ) : (
                    <View className="p-3 rounded-lg border border-gray-100">
                        <Text className="text-sm text-gray-500 text-center">No recent searches yet</Text>
                    </View>
                )}
            </View>

            <View>
                <Button
                    icon='chevron-up'
                    onPress={() => setIsDropVisible(false)}
                    style='secondary'
                    customClasses='mt-1 bg-transparent border-transparent shadow-none'
                />
            </View>
        </View>
    );

    const HEADER_ROW =
        'bg-white dark:bg-base-dark-100 rounded-2xl min-h-[52px] px-3';

    return (
        <View className="w-full flex-1 pb-4 overflow-visible">
            <View className="w-full px-4 pt-3 pb-6 gap-3" style={greenHeaderStyle}>
                <View className={`flex-row items-center ${HEADER_ROW} gap-2`}>
                    <Octicons name="search" size={20} color="#9ca3af" />
                    <Input
                        placeholder="Search by name, cuisine, or event type…"
                        value={formData.searchQuery}
                        onChangeText={handlePrimarySearchChange}
                        onFocus={() => setIsDropVisible(true)}
                        containerClasses="flex-1 mb-0 min-w-0"
                        embedded
                    />
                    <Button
                        icon="search"
                        onPress={() => { handleSearch(); setIsDropVisible(false); }}
                        style="accent"
                        customClasses="rounded-xl w-11 h-11 m-0 shrink-0"
                    />
                </View>

                {isDropVisible ? renderDropView() : null}

                <LocationInput formData={formData} setFormData={setFormData} />
            </View>
        </View>
    );
}