import { useState, useEffect, useCallback } from 'react';
import { FlatList, View, Text, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import getEnvVars from "../../config";
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../providers/ThemeProvider';
import Octicons from '@expo/vector-icons/Octicons';
import ProfilePicture from "../components/ProfilePicture";
import LoadingIcon from '../components/LoadingIcon';

export default function Messages() {
    
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const { apiUrl } = getEnvVars();
    const { userId, userType, token, profileId } = useAuth(); 
    const { manualTheme } = useTheme();
    const router = useRouter();

    const fetchConversations = async () => {
        try {
            const url = `${apiUrl}/api/chat/conversations?${userType}_id=${profileId}`;
            console.log('Fetching conversations from URL:', url);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });

            console.log('Status: ', response.status); 

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

    /*useEffect(() => {
        fetchConversations();
    }, [userId, userType]); */
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
        // Navigate to chat
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

    const formatTimeRelevance = (timestamp) => {
        if (!timestamp) return '';

        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;

        if (diffMs < 60 * 1000) return 'Just now';

        const diffMins = Math.floor(diffMs / (1000 * 60));
        if (diffMins < 60) return `${diffMins}m ago`;

        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHours < 24) return `${diffHours}h ago`;

        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) {
            return date.toLocaleDateString('en-US', { weekday: 'short' });
        }

        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const getMessagePreview = (conversation) => {
        const preview = conversation?.last_message?.trim();
        if (preview) return preview;
        return 'No message preview yet';
    };

    const formatClockTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    };

    const renderConversation = ({ item }) => {
        console.log(JSON.stringify(item))

        let otherUserName;
         
        if (userType === 'chef'){
            otherUserName = `${item.customer_first_name} ${item.customer_last_name}`;
        } 
        else {
            otherUserName = `${item.chef_first_name} ${item.chef_last_name}`;
        }
        
        const hasUnread = item.unread_count > 0;

        return (
            <TouchableOpacity
                onPress={() => handleConversationPress(item)}
                className="bg-white dark:bg-base-dark-200 border-b border-gray-200 dark:border-gray-700"
            >
                <View className="flex-row items-center p-4">
                    {/* Profile Photo */} 
                    <ProfilePicture photoUrl={item.photo_url} size={12} customClasses='mr-3' firstName={item.customer_first_name} lastName={item.customer_last_name} />

                    {/* Message Content */}
                    <View className="flex-1">
                        <View className="flex-row justify-between items-center mb-1">
                            <Text 
                                className={`text-base ${hasUnread ? 'font-bold' : 'font-semibold'} text-gray-900 dark:text-gray-100`}
                                numberOfLines={1}
                            >
                                {otherUserName}
                            </Text>
                            <Text className="text-xs text-gray-500 dark:text-gray-400">
                                {formatTimeRelevance(item.last_message_at)}
                            </Text>
                        </View>
                        
                        <View className="flex-row justify-between items-center">
                            <Text 
                                className={`text-sm ${hasUnread ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'} flex-1`}
                                numberOfLines={1}
                            >
                                {formatClockTime(item.last_message_at)
                                    ? `${getMessagePreview(item)} · ${formatClockTime(item.last_message_at)}`
                                    : getMessagePreview(item)}
                            </Text>
                            
                            {hasUnread && (
                                <View className="bg-primary-500 rounded-full w-6 h-6 items-center justify-center ml-2">
                                    <Text className="text-white text-xs font-bold">
                                        {item.unread_count > 9 ? '9+' : item.unread_count}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Arrow Icon */}
                    <Octicons 
                        name="chevron-right" 
                        size={20} 
                        color={manualTheme === 'light' ? '#9CA3AF' : '#6B7280'} 
                        style={{ marginLeft: 8 }}
                    />
                </View>
            </TouchableOpacity>
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
        {/*Retry button*/}
        return (
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
        );
    }

    return (
        <View className="flex-1 bg-base-100 dark:bg-base-dark-100 ">

            {/* Conversation List */}
            {conversations.length === 0 ? (
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
                <FlatList
                    data={conversations}
                    renderItem={renderConversation}
                    keyExtractor={(item) => item.chat_id.toString()}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor="#65A30D"
                        />
                    }
                    contentContainerStyle={{ flexGrow: 1 }}
                    paddingTop={0}
                />
            )}
        </View>
    );
}