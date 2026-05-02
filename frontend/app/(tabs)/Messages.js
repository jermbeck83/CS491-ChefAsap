import { useState, useCallback, useMemo, useRef } from 'react';
import {
    FlatList,
    View,
    Text,
    TouchableOpacity,
    RefreshControl,
    TextInput,
    Pressable,
    ScrollView,
    Platform,
    Image,
} from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import getEnvVars from "../../config";
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../providers/ThemeProvider';
import Octicons from '@expo/vector-icons/Octicons';
import LoadingIcon from '../components/LoadingIcon';
import { getTailwindColor } from '../utils/getTailwindColor';

const FILTER_TABS = ['All', 'Unread', 'Chefs', 'Bookings'];

const AVATAR_PALETTE_LIGHT = ['#D1FAE5', '#E9D5FF', '#FEF3C7', '#BFDBFE', '#FECDD3', '#FDE68A'];
const AVATAR_PALETTE_DARK = ['#14532D', '#4C1D95', '#713F12', '#1E3A5F', '#831843', '#713F12'];

function hashString(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

function getInitials(firstName, lastName) {
    const a = (firstName || '').trim();
    const b = (lastName || '').trim();
    const i1 = a[0] || '';
    const i2 = b[0] || (a[1] || '');
    return `${i1}${i2}`.toUpperCase() || '?';
}

export default function Messages() {

    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const searchRef = useRef(null);
    const { apiUrl } = getEnvVars();
    const { userType, token, profileId } = useAuth();
    const { manualTheme } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const isLight = manualTheme === 'light';
    const pageBg = isLight ? getTailwindColor('base.100') : getTailwindColor('base.dark.100');
    const cardBg = isLight ? '#ffffff' : getTailwindColor('base.dark.200');
    const mutedText = isLight ? '#78716c' : getTailwindColor('base.dark.300');
    const borderSubtle = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
    const iconMuted = isLight ? '#57534e' : '#a8a29e';

    const fetchConversations = async () => {
        try {
            const url = `${apiUrl}/api/chat/conversations?${userType}_id=${profileId}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch conversations.');
            }

            const data = await response.json();

            setConversations(data);
            setError(null);

        }
        catch (err) {
            console.error('Error fetching conversations: ', err);
            setError('Failed to load messages. Please try again.');
        }
        finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            fetchConversations();
        }, [profileId, userType])
    );

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchConversations();
    }, []);

    const handleConversationPress = (conversation) => {
        router.push({
            pathname: '/ChatScreen',
            params: {
                chatId: conversation.chat_id,
                otherUserId: userType === 'chef' ? conversation.customer_id : conversation.chef_id,
                otherUserName: userType === 'chef'
                    ? `${conversation.customer_first_name} ${conversation.customer_last_name}`
                    : `${conversation.chef_first_name} ${conversation.chef_last_name}`,
            }
        });
    };

    const formatListTimestamp = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const getMessagePreview = (conversation) => {
        const preview = conversation?.last_message?.trim();
        if (preview) return preview;
        return 'No message preview yet';
    };

    const getOtherName = (item) => {
        if (userType === 'chef') {
            return `${item.customer_first_name} ${item.customer_last_name}`;
        }
        return `${item.chef_first_name} ${item.chef_last_name}`;
    };

    const getPhotoFirstLast = (item) => {
        if (userType === 'chef') {
            return { first: item.customer_first_name, last: item.customer_last_name, url: item.photo_url };
        }
        return { first: item.chef_first_name, last: item.chef_last_name, url: item.photo_url };
    };

    const filteredConversations = useMemo(() => {
        let list = conversations;

        if (filter === 'Unread') {
            list = list.filter((c) => c.unread_count > 0);
        } else if (filter === 'Chefs') {
            list = list.filter((c) => !c.booking_id);
        } else if (filter === 'Bookings') {
            list = list.filter((c) => !!c.booking_id);
        }

        const q = searchQuery.trim().toLowerCase();
        if (q) {
            list = list.filter((c) => {
                const name = getOtherName(c).toLowerCase();
                const preview = (c.last_message || '').toLowerCase();
                return name.includes(q) || preview.includes(q);
            });
        }

        return list;
    }, [conversations, filter, searchQuery, userType]);

    const renderConversation = ({ item }) => {
        const otherUserName = getOtherName(item);
        const { first, last, url } = getPhotoFirstLast(item);
        const hasUnread = item.unread_count > 0;
        const initials = getInitials(first, last);
        const palette = isLight ? AVATAR_PALETTE_LIGHT : AVATAR_PALETTE_DARK;
        const bgColor = palette[hashString(otherUserName) % palette.length];
        const initialsColor = isLight ? getTailwindColor('primary.400') : getTailwindColor('primary.100');

        return (
            <Pressable
                onPress={() => handleConversationPress(item)}
                android_ripple={{ color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)' }}
                style={({ pressed }) => ({
                    backgroundColor: pressed
                        ? (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)')
                        : 'transparent',
                })}
            >
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                    }}
                >
                    <View style={{ marginRight: 12 }}>
                        <View
                            style={{
                                width: 52,
                                height: 52,
                                borderRadius: 26,
                                overflow: 'hidden',
                                borderWidth: 1,
                                borderColor: borderSubtle,
                                backgroundColor: bgColor,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            {url ? (
                                <Image
                                    source={{ uri: url?.startsWith('data:') ? url : `${apiUrl}${url}` }}
                                    style={{ width: 52, height: 52 }}
                                />
                            ) : (
                                <Text style={{ fontSize: 16, fontWeight: '700', color: initialsColor }}>
                                    {initials}
                                </Text>
                            )}
                        </View>
                    </View>

                    <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                            <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                                <Text
                                    style={{
                                        fontSize: 16,
                                        fontWeight: hasUnread ? '700' : '600',
                                        color: isLight ? '#1c1917' : '#fafaf9',
                                    }}
                                    numberOfLines={1}
                                >
                                    {otherUserName}
                                </Text>
                                <Text
                                    style={{
                                        marginTop: 4,
                                        fontSize: 14,
                                        color: hasUnread ? (isLight ? '#44403c' : '#e7e5e4') : mutedText,
                                        fontWeight: hasUnread ? '600' : '400',
                                    }}
                                    numberOfLines={1}
                                >
                                    {getMessagePreview(item)}
                                </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ fontSize: 12, color: mutedText, fontWeight: '500' }}>
                                    {formatListTimestamp(item.last_message_at)}
                                </Text>
                                {hasUnread ? (
                                    <View
                                        style={{
                                            marginTop: 6,
                                            minWidth: 22,
                                            height: 22,
                                            paddingHorizontal: 7,
                                            borderRadius: 11,
                                            backgroundColor: '#dc2626',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>
                                            {item.unread_count > 9 ? '9+' : item.unread_count}
                                        </Text>
                                    </View>
                                ) : null}
                            </View>
                        </View>
                    </View>
                </View>
            </Pressable>
        );
    };

    if (loading && !refreshing) {
        return (
            <>
                <Stack.Screen options={{ headerShown: false }} />
                <View className="flex-1 justify-center items-center bg-base-100 dark:bg-base-dark-100">
                    <LoadingIcon message="Loading messages..." />
                </View>
            </>
        );
    }

    if (error) {
        return (
            <>
                <Stack.Screen options={{ headerShown: false }} />
                <View className="flex-1 bg-base-100 dark:bg-base-dark-100 justify-center items-center px-6">
                    <Octicons name="alert" size={48} color={manualTheme === 'dark' ? '#D9F99D ' : '#4D7C0F'} />
                    <Text className="text-gray-900 dark:text-gray-100 text-lg font-semibold mt-4">
                        {error}
                    </Text>
                    <TouchableOpacity
                        onPress={fetchConversations}
                        className="bg-primary-500 px-6 py-3 rounded-lg mt-4"
                    >
                        <Text className="text-white font-semibold">Try Again</Text>
                    </TouchableOpacity>
                </View>
            </>
        );
    }

    const listEmpty = conversations.length === 0;
    const filteredEmpty = !listEmpty && filteredConversations.length === 0;

    return (
        <View style={{ flex: 1, backgroundColor: pageBg }}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={{ paddingTop: insets.top, paddingHorizontal: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Text
                        style={{
                            fontSize: 28,
                            fontWeight: '800',
                            color: isLight ? '#1c1917' : '#fafaf9',
                            letterSpacing: -0.5,
                        }}
                    >
                        Messages
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity
                            onPress={() => searchRef.current?.focus()}
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor: isLight ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.08)',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderWidth: 1,
                                borderColor: borderSubtle,
                            }}
                            accessibilityLabel="Focus search"
                        >
                            <Octicons name="search" size={20} color={iconMuted} />
                        </TouchableOpacity>
                    </View>
                </View>

                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: isLight ? '#e7e5e4' : borderSubtle,
                        backgroundColor: cardBg,
                        paddingHorizontal: 14,
                        paddingVertical: Platform.OS === 'ios' ? 10 : 4,
                        marginBottom: 14,
                    }}
                >
                    <Octicons name="search" size={18} color={mutedText} style={{ marginRight: 8 }} />
                    <TextInput
                        ref={searchRef}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search messages..."
                        placeholderTextColor={mutedText}
                        style={{
                            flex: 1,
                            fontSize: 16,
                            color: isLight ? '#1c1917' : '#fafaf9',
                            paddingVertical: Platform.OS === 'android' ? 8 : 0,
                        }}
                    />
                </View>

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
                >
                    {FILTER_TABS.map((tab) => {
                        const active = filter === tab;
                        return (
                            <Pressable
                                key={tab}
                                onPress={() => setFilter(tab)}
                                android_ripple={{ color: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)' }}
                                style={{
                                    paddingHorizontal: 18,
                                    paddingVertical: 8,
                                    borderRadius: 999,
                                    borderWidth: 1.5,
                                    borderColor: active ? '#2d6a4f' : '#dde8dd',
                                    backgroundColor: active ? '#2d6a4f' : '#fff',
                                }}
                            >
                                <Text
                                    style={{
                                        fontSize: 14,
                                        fontWeight: '600',
                                        color: active ? '#ffffff' : '#4a7c59',
                                    }}
                                >
                                    {tab}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>
            </View>

            {listEmpty ? (
                <View className="flex-1 justify-center items-center px-6">
                    <Octicons
                        name="comment-discussion"
                        size={64}
                        color={manualTheme === 'light' ? '#4D7C0F' : '#D9F99D '}
                    />
                    <Text className="text-gray-900 dark:text-gray-100 text-xl font-semibold mt-4 text-center">
                        No messages yet
                    </Text>
                    <Text className="text-gray-600 dark:text-gray-400 text-center mt-2">
                        Book a chef to start chatting
                    </Text>
                </View>
            ) : (
                <View
                    style={{
                        flex: 1,
                        marginHorizontal: 20,
                        marginBottom: Math.max(insets.bottom, 12),
                        borderRadius: 20,
                        backgroundColor: cardBg,
                        borderWidth: 1,
                        borderColor: borderSubtle,
                        overflow: 'hidden',
                        ...Platform.select({
                            ios: {
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: isLight ? 0.06 : 0.2,
                                shadowRadius: 12,
                            },
                            android: { elevation: 3 },
                        }),
                    }}
                >
                    {filteredEmpty ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                            <Octicons name="filter" size={40} color={mutedText} />
                            <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '600', color: isLight ? '#44403c' : '#e7e5e4' }}>
                                No conversations match
                            </Text>
                            <Text style={{ marginTop: 4, fontSize: 14, color: mutedText, textAlign: 'center' }}>
                                Try another filter or search term
                            </Text>
                        </View>
                    ) : (
                        <FlatList
                            data={filteredConversations}
                            renderItem={renderConversation}
                            keyExtractor={(item) => item.chat_id.toString()}
                            ItemSeparatorComponent={() => (
                                <View style={{ height: 1, backgroundColor: borderSubtle, marginLeft: 80 }} />
                            )}
                            refreshControl={
                                <RefreshControl
                                    refreshing={refreshing}
                                    onRefresh={onRefresh}
                                    tintColor="#65A30D"
                                />
                            }
                            contentContainerStyle={{ flexGrow: 1, paddingBottom: 8 }}
                            keyboardShouldPersistTaps="handled"
                        />
                    )}
                </View>
            )}
        </View>
    );
}
