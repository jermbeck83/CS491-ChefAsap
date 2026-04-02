import { View, Modal, Platform } from "react-native";
import { Tabs, useGlobalSearchParams, useRouter } from 'expo-router';
import Octicons from '@expo/vector-icons/Octicons';
import { TransitionPresets } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';
import { useTheme } from '../providers/ThemeProvider';
import { getTailwindColor } from '../utils/getTailwindColor';
import BookingReviewModal from "../components/BookingReviewModal";
import OrderConfirmationModal from "../components/OrderConfirmationModal";
import getEnvVars from "../../config";

export default function TabLayout() {
    const { isAuthenticated, userType, isLoading, profileId, token } = useAuth();
    const { apiUrl } = getEnvVars();
    const router = useRouter();
    const { manualTheme, /*setIsOnAuthPage*/ } = useTheme();
    //setIsOnAuthPage(false);
    const [bookings, setBookings] = useState([]);

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.replace('/(auth)');
        }
        if (!isLoading && isAuthenticated) {
            const fetchBookings = async () => {
                if (!profileId) return;

                try {
                    const url = `${apiUrl}/booking/${userType}/${profileId}/bookings/finished`;

                    const response = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                        },
                    });

                    const data = await response.json();
                    console.log(data.bookings);

                    if (response.ok) {
                        setBookings(data.bookings);
                    } else {
                        alert('Error', data.error || 'Failed to load bookings.');
                    }
                } catch (err) {
                    alert('Error: ' + (err.message || 'Network error. Could not connect to API.'));
                }
            };

            fetchBookings();
        }
    }, [isLoading, isAuthenticated, router]);

    const iconSize = 24;
    const isIOS = Platform.OS === 'ios';

    const tabBarOptions = {
        headerShown: false,
        tabBarActiveTintColor: manualTheme === 'light' ? getTailwindColor('primary.100') : getTailwindColor('dark.100'),
        tabBarInactiveTintColor: manualTheme === 'light' ? getTailwindColor('dark.100') : getTailwindColor('primary.100'),
        //tabBarActiveBackgroundColor: '#BEF264', // primary-200
        //tabBarInactiveBackgroundColor: '#65A30D', // primary-300
        //tabBarShowLabels: false, //doesnt seem to do anything, should show/hide label
        tabBarHideOnKeyboard: true,
        sceneStyle: {
            backgroundColor: manualTheme === 'light' ? getTailwindColor('base.100') : getTailwindColor('base.dark.100'),
        },
        // other options: tabBarIcon (notifications), tabBarAccessibilityLabel (accessibility (out of scope))
        tabBarStyle: {
            backgroundColor: manualTheme === 'light' ? getTailwindColor('primary.300') : getTailwindColor('primary.400'), // primary-300
            height: isIOS ? 62 : 70,
            paddingTop: isIOS ? 6 : 4,
            paddingBottom: isIOS ? 6 : 8,
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
        },
        tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
            marginTop: isIOS ? 0 : 2,
        },
        screenOptions: {
            animation: 'shift', //doesnt seem to work
        },
    };

    if (userType === 'chef') return (
        <View className="bg-base-100 dark:bg-base-dark-100 flex-1">
            <Modal
                visible={bookings.length > 0}
                animationType="fade"
                transparent={true}
            >
                <View className='bg-black/50 h-full flex items-center justify-center'>
                    {bookings.length > 0 &&
                        <OrderConfirmationModal
                            key={bookings[0].booking_id}
                            onClose={() => setBookings(bookings.filter(b => b.booking_id !== bookings[0].booking_id))}
                            booking={bookings[0]}
                        />
                    }
                </View>
            </Modal>

            <Tabs screenOptions={tabBarOptions}>
                <Tabs.Screen
                    name="BookingsScreen"
                    options={{
                        title: 'Bookings',
                        tabBarIcon: ({ color }) =>
                            <Octicons name="calendar" size={iconSize} color={color} />,
                        ...TransitionPresets.ShiftTransition,

                    }}
                />

                <Tabs.Screen
                    name="Messages"
                    options={{
                        title: 'Messages',
                        tabBarIcon: ({ color }) =>
                            <Octicons name="comment-discussion" size={iconSize} color={color} />,
                        tabBarBadge: 5,
                        tabBarBadgeStyle: {
                            backgroundColor: 'red',
                            color: manualTheme === 'light' ? getTailwindColor('primary.300') : getTailwindColor('primary.400'),
                            fontSize: 10,
                        },
                        ...TransitionPresets.ShiftTransition,
                    }}
                />

                <Tabs.Screen
                    name="Profile"
                    options={{
                        title: 'Profile',
                        tabBarIcon: ({ color }) =>
                            <Octicons name="person" size={iconSize} color={color} />,
                        ...TransitionPresets.ShiftTransition,
                    }}
                />

                <Tabs.Screen
                    name="SearchScreen"
                    options={{
                        href: null,
                    }}
                />
            </Tabs>
        </View>
    );

    return (
        <View className="bg-base-100 dark:bg-base-dark-100 flex-1">
            <Modal
                visible={bookings.length > 0}
                animationType="fade"
                transparent={true}
            >
                <View className='bg-black/50 h-full flex items-center justify-center'>
                    {bookings.length > 0 && 
                        <BookingReviewModal
                            key={bookings[0].booking_id}
                            onClose={() => setBookings(bookings.filter(b => b.booking_id !== bookings[0].booking_id))}
                            customerId={profileId}
                            booking={bookings[0]}
                        />
                    }
                </View>
            </Modal>

            <Tabs screenOptions={tabBarOptions}>
                <Tabs.Screen
                    name="SearchScreen"
                    options={{
                        href: 'SearchScreen',
                        title: 'Search',
                        tabBarIcon: ({ color }) =>
                            <Octicons name="search" size={iconSize} color={color} />,
                        ...TransitionPresets.ShiftTransition,

                    }}
                />

                <Tabs.Screen
                    name="BookingsScreen"
                    options={{
                        title: 'Bookings',
                        tabBarIcon: ({ color }) =>
                            <Octicons name="calendar" size={iconSize} color={color} />,
                        ...TransitionPresets.ShiftTransition,

                    }}
                />

                <Tabs.Screen
                    name="Messages"
                    options={{
                        title: 'Messages',
                        tabBarIcon: ({ color }) =>
                            <Octicons name="comment-discussion" size={iconSize} color={color} />,
                        tabBarBadge: 5,
                        tabBarBadgeStyle: {
                            backgroundColor: 'red',
                            color: manualTheme === 'light' ? getTailwindColor('primary.500') : getTailwindColor('dark.500'),
                            fontSize: 10,
                        },
                        ...TransitionPresets.ShiftTransition,
                    }}
                />

                <Tabs.Screen
                    name="Profile"
                    options={{
                        title: 'Profile',
                        tabBarIcon: ({ color }) =>
                            <Octicons name="person" size={iconSize} color={color} />,
                        ...TransitionPresets.ShiftTransition,

                    }}
                />
            </Tabs>
        </View>
    );
}