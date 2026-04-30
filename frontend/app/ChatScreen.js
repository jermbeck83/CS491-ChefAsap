import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
    FlatList, View, Text, TouchableOpacity, TextInput,
    ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import getEnvVars from "../config";
import { useAuth } from './context/AuthContext';
import Octicons from '@expo/vector-icons/Octicons';
import LoadingIcon from './components/LoadingIcon';

const GREEN = '#2d6a4f';
const GREEN_LIGHT = '#d8f3dc';
const BG = '#fefce8';

export default function ChatScreen() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [newMessage, setNewMessage] = useState('');
    const [messages, setMessages] = useState([]);
    const [sending, setSending] = useState(false);
    const { chatId, otherUserName, otherUserId } = useLocalSearchParams();
    const { apiUrl } = getEnvVars();
    const { userId, userType, token, profileId } = useAuth();
    const router = useRouter();
    const flatListRef = useRef();
    const insets = useSafeAreaInsets();

    let chefId, customerId;
    if (userType === 'chef') {
        chefId = profileId;
        customerId = otherUserId;
    } else {
        customerId = profileId;
        chefId = otherUserId;
    }

    useEffect(() => {
        fetchMessages();
        const interval = setInterval(fetchMessages, 2000);
        return () => clearInterval(interval);
    }, [chatId]);

    useEffect(() => {
        if (chatId) markAsRead();
    }, [chatId]);

    const fetchMessages = async () => {
        try {
            const url = `${apiUrl}/api/chat/history?customer_id=${customerId}&chef_id=${chefId}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            });
            if (!response.ok) throw new Error('Failed to fetch chat history.');
            const data = await response.json();
            setMessages(data);
            setError(null);
        } catch (err) {
            setError('Failed to load chat. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async () => {
        if (!chatId) return;
        try {
            await fetch(`${apiUrl}/api/chat/mark-read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ chat_id: chatId, user_type: userType }),
            });
        } catch (err) {}
    };

    const handleSendMessage = async () => {
        const trimmedMessage = newMessage.trim();
        if (!trimmedMessage) return;
        setSending(true);
        try {
            const response = await fetch(`${apiUrl}/api/chat/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    customer_id: customerId,
                    chef_id: chefId,
                    sender_type: userType,
                    message: trimmedMessage,
                }),
            });
            if (!response.ok) throw new Error('Failed to send message.');
            setNewMessage('');
            fetchMessages();
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        } catch (err) {
        } finally {
            setSending(false);
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    useLayoutEffect(() => {
        if (flatListRef.current && messages.length > 0) {
            flatListRef.current.scrollToEnd({ animated: false });
        }
    }, [messages]);

    const renderMessage = ({ item }) => {
        const sentByUser = item.sender_type === userType;
        return (
            <View style={[s.msgRow, sentByUser ? s.msgRowRight : s.msgRowLeft]}>
                <View style={[s.bubble, sentByUser ? s.bubbleSent : s.bubbleReceived]}>
                    <Text style={[s.bubbleText, sentByUser ? s.bubbleTextSent : s.bubbleTextReceived]}>
                        {item.message}
                    </Text>
                    <Text style={[s.bubbleTime, sentByUser ? s.bubbleTimeSent : s.bubbleTimeReceived]}>
                        {formatTime(item.sent_at)}
                    </Text>
                </View>
            </View>
        );
    };

    if (loading) {
        return (
            <>
                <Stack.Screen options={{ headerShown: false, contentStyle: { backgroundColor: '#fefce8' } }} />
                <SafeAreaView style={{ flex: 1, backgroundColor: '#fefce8' }}>
                <View style={s.centered}>
                    <LoadingIcon message="Loading chat..." />
                </View>
                </SafeAreaView>
            </>
        );
    }

    return (
        <>
            <Stack.Screen options={{ headerShown: false, contentStyle: { backgroundColor: '#fefce8' } }} />
            <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
            <View style={s.screen}>

                {/* Header */}
                <View style={[s.header, { paddingTop: insets.top + 8 }]}>
                    <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                        <Octicons name="chevron-left" size={24} color={GREEN} />
                    </TouchableOpacity>
                    <Text style={s.headerName} numberOfLines={1}>{otherUserName}</Text>
                    <View style={{ width: 40 }} />
                </View>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 50}
                >
                    {messages.length === 0 ? (
                        <View style={s.centered}>
                            <Octicons name="comment" size={56} color={GREEN_LIGHT} />
                            <Text style={s.emptyTitle}>No messages yet</Text>
                            <Text style={s.emptySubtitle}>Start the conversation below</Text>
                        </View>
                    ) : (
                        <FlatList
                            ref={flatListRef}
                            data={messages}
                            renderItem={renderMessage}
                            keyExtractor={(item) => item.message_id.toString()}
                            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
                            style={{ backgroundColor: BG }}
                        />
                    )}

                    {/* Input bar */}
                    <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                        <TextInput
                            value={newMessage}
                            onChangeText={setNewMessage}
                            placeholder="Type a message..."
                            placeholderTextColor="#aab4a8"
                            style={s.textInput}
                            multiline
                        />
                        <TouchableOpacity
                            onPress={handleSendMessage}
                            disabled={sending || !newMessage.trim()}
                            style={[
                                s.sendBtn,
                                (!newMessage.trim() || sending) && s.sendBtnDisabled
                            ]}
                            activeOpacity={0.8}
                        >
                            {sending
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Octicons name="paper-airplane" size={18} color="#fff" />
                            }
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </View>
            </SafeAreaView>
        </>
    );
}

const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: BG },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: BG, padding: 24 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 14,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e2ece2',
    },
    backBtn: {
        width: 40, height: 40,
        borderRadius: 20,
        backgroundColor: GREEN_LIGHT,
        alignItems: 'center', justifyContent: 'center',
    },
    headerName: {
        flex: 1, textAlign: 'center',
        fontSize: 17, fontWeight: '700',
        color: '#1a2e1a',
        marginHorizontal: 8,
    },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a2e1a', marginTop: 16 },
    emptySubtitle: { fontSize: 14, color: '#6b8f71', marginTop: 6, textAlign: 'center' },
    msgRow: { marginVertical: 3, flexDirection: 'row' },
    msgRowRight: { justifyContent: 'flex-end' },
    msgRowLeft: { justifyContent: 'flex-start' },
    bubble: {
        maxWidth: '75%',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
    },
    bubbleSent: {
        backgroundColor: GREEN,
        borderBottomRightRadius: 4,
        shadowColor: GREEN,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 2,
    },
    bubbleReceived: {
        backgroundColor: '#fff',
        borderBottomLeftRadius: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 1,
    },
    bubbleText: { fontSize: 15, lineHeight: 21 },
    bubbleTextSent: { color: '#fff' },
    bubbleTextReceived: { color: '#1a2e1a' },
    bubbleTime: { fontSize: 11, marginTop: 4 },
    bubbleTimeSent: { color: 'rgba(255,255,255,0.65)', textAlign: 'right' },
    bubbleTimeReceived: { color: '#8aab8a' },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 16,
        paddingTop: 10,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#e2ece2',
        gap: 10,
    },
    textInput: {
        flex: 1,
        backgroundColor: BG,
        borderWidth: 1.5,
        borderColor: '#dde8dd',
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 15,
        color: '#1a2e1a',
        maxHeight: 120,
    },
    sendBtn: {
        width: 44, height: 44,
        borderRadius: 22,
        backgroundColor: GREEN,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 2,
        shadowColor: GREEN,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 3,
    },
    sendBtnDisabled: { backgroundColor: '#c8ddd0' },
});