import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { ScrollView, Text, Alert, View, Modal, Image, TouchableOpacity, StyleSheet, TextInput } from "react-native";
import { Octicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';

import getEnvVars from "../../config";
import { useAuth } from "../context/AuthContext";

import LoadingIcon from "../components/LoadingIcon";
import ProfilePicture from "../components/ProfilePicture";
import RatingsDisplay from '../components/RatingsDisplay';

const GREEN = '#2d6a4f';
const GREEN_LIGHT = '#d8f3dc';
const BG = '#fefce8';
const BORDER = '#e2ece2';
const TEXT = '#1a2e1a';
const TEXT_MID = '#4a7c59';
const TEXT_SOFT = '#8aab8a';

const getImageSource = (photoUrl, apiUrl) => {
    if (!photoUrl) return null;
    if (photoUrl.startsWith('data:')) return { uri: photoUrl };
    return { uri: `${apiUrl}${photoUrl}` };
};

const parseZipFromLocation = (locationText) => {
    if (!locationText) return '';
    const match = String(locationText).match(/\b\d{5}\b/);
    return match ? match[0] : '';
};

const MenuItemCard = ({ item, onAddToOrder, apiUrl, userType }) => {
    const imgSrc = getImageSource(item?.photo_url, apiUrl);
    const canOrder = userType !== 'chef' && item?.is_available;

    return (
        <View style={s.menuCard}>
            <Text style={s.menuItemName}>{item?.dish_name || 'Dish Name'}</Text>
            <View style={s.menuItemBody}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                    {item?.description ? <Text style={s.menuItemDesc}>{item.description}</Text> : null}
                    {item?.servings ? <Text style={s.menuItemMeta}>Servings: {item.servings}</Text> : null}
                    {item?.spice_level ? <Text style={s.menuItemMeta}>Spice Level: {item.spice_level}</Text> : null}
                </View>
                <View style={{ width: 130 }}>
                    {imgSrc ? (
                        <Image source={imgSrc} style={s.menuItemImage} resizeMode="cover" />
                    ) : (
                        <View style={[s.menuItemImage, s.menuItemImageEmpty]}>
                            <Text style={s.menuItemImageEmptyText}>NO IMAGE</Text>
                        </View>
                    )}
                </View>
            </View>
            <View style={s.menuItemFooter}>
                {item?.prep_time ? <Text style={s.menuItemFooterMeta}>Prep time: {item.prep_time} min</Text> : null}
                {item?.price ? <Text style={s.menuItemPrice}>${item.price.toFixed(2)}</Text> : null}
            </View>
            <TouchableOpacity
                style={[s.addBtn, !canOrder && s.addBtnDisabled]}
                onPress={() => onAddToOrder && onAddToOrder(item)}
                disabled={!canOrder}
                activeOpacity={0.85}
            >
                <Text style={[s.addBtnText, !canOrder && s.addBtnTextDisabled]}>
                    {item?.is_available ? 'Add to order' : 'Not available'}
                </Text>
            </TouchableOpacity>
        </View>
    );
};

const SectionCard = ({ title, children, defaultExpanded = true }) => {
    const [expanded, setExpanded] = useState(defaultExpanded);
    return (
        <View style={s.sectionCard}>
            <TouchableOpacity style={s.sectionHeader} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
                <Text style={s.sectionTitle}>{title}</Text>
                <Octicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={TEXT_SOFT} />
            </TouchableOpacity>
            {expanded && <View style={s.sectionBody}>{children}</View>}
        </View>
    );
};

export default function ChefMenu() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { token, userId, profileId, userType } = useAuth();
    const { apiUrl } = getEnvVars();

    const [chefData, setChefData] = useState(null);
    const [menuItems, setMenuItems] = useState([]);
    const [featuredItems, setFeaturedItems] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [orderItems, setOrderItems] = useState([]);

    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedDay, setSelectedDay] = useState(new Date().getDate());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedHour, setSelectedHour] = useState(12);
    const [selectedMinute, setSelectedMinute] = useState(0);
    const [showOrderModal, setShowOrderModal] = useState(false);

    const [paymentMethods, setPaymentMethods] = useState([]);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
    const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
    const [paymentProcessing, setPaymentProcessing] = useState(false);
    const [pricingQuote, setPricingQuote] = useState(null);
    const [pricingLoading, setPricingLoading] = useState(false);
    const [eventZip, setEventZip] = useState('');
    const hasShownSurgeAlertRef = useRef(false);

    useEffect(() => {
        if (!id) return;
        const chefId = parseInt(id, 10);
        const fetchData = async () => {
            setLoading(true);
            try {
                const [profileRes, menuRes, featuredRes, catRes] = await Promise.all([
                    fetch(`${apiUrl}/profile/chef/${chefId}/public`, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } }),
                    fetch(`${apiUrl}/api/menu/chef/${chefId}`, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } }),
                    fetch(`${apiUrl}/api/menu/chef/${chefId}/featured`, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } }),
                    fetch(`${apiUrl}/api/menu/chef/${chefId}/categories`, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } }),
                ]);
                const [profileData, menuData, featuredData, catData] = await Promise.all([profileRes.json(), menuRes.json(), featuredRes.json(), catRes.json()]);
                if (profileRes.ok) setChefData(profileData.profile);
                if (menuRes.ok) setMenuItems(menuData.menu_items || []);
                if (featuredRes.ok) setFeaturedItems(featuredData.featured_items || []);
                if (catRes.ok) setCategories(catData.categories || []);
            } catch (err) {
                Alert.alert('Error', 'Network error. Could not load menu.');
            } finally { setLoading(false); }
        };
        fetchData();
    }, [id, apiUrl, token]);

    const itemsByCategory = useMemo(() => {
        const grouped = {};
        categories.forEach(cat => { grouped[cat.id] = { name: cat.category_name, items: [] }; });
        grouped['uncategorized'] = { name: 'Other Dishes', items: [] };
        menuItems.forEach(item => {
            if (item.category_id && grouped[item.category_id]) grouped[item.category_id].items.push(item);
            else grouped['uncategorized'].items.push(item);
        });
        return grouped;
    }, [menuItems, categories]);

    const handleAddToOrder = (item) => {
        if (!item.is_available) { Alert.alert('Not Available', 'This dish is currently not available.'); return; }
        const existing = orderItems.find(o => o.id === item.id);
        if (existing) {
            setOrderItems(orderItems.map(o => o.id === item.id ? { ...o, quantity: o.quantity + 1 } : o));
        } else {
            setOrderItems([...orderItems, { ...item, quantity: 1 }]);
        }
    };

    const fetchPaymentMethods = async () => {
        const userIdToUse = userId || profileId;
        if (!userIdToUse) return;
        setLoadingPaymentMethods(true);
        try {
            const response = await fetch(`${apiUrl}/stripe-payment/payment-methods?customer_id=${userIdToUse}`, {
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            });
            const data = await response.json();
            if (response.ok) {
                setPaymentMethods(data.payment_methods || []);
                const def = data.payment_methods?.find(pm => pm.is_default);
                if (def) setSelectedPaymentMethod(def.id);
            }
        } catch (e) {} finally { setLoadingPaymentMethods(false); }
    };

    useEffect(() => { if (showOrderModal && userType === 'customer') fetchPaymentMethods(); }, [showOrderModal]);

    useEffect(() => {
        if (chefData?.public_location) {
            setEventZip(parseZipFromLocation(chefData.public_location));
        }
    }, [chefData?.public_location]);

    const getMealType = (hour) => {
        if (hour >= 5 && hour < 11) return 'breakfast';
        if (hour >= 11 && hour < 16) return 'lunch';
        return 'dinner';
    };

    const handlePlaceOrder = async () => {
        if (!selectedPaymentMethod) { Alert.alert('Payment Required', 'Please select a payment method.'); return; }
        setPaymentProcessing(true);
        try {
            const deliveryDateTime = new Date(selectedYear, selectedMonth, selectedDay, selectedHour, selectedMinute);
            const baseTotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const quoteMultiplier = Number(pricingQuote?.multiplier || 1);
            const dynamicTotal = Number(pricingQuote?.final_price || baseTotal);
            const payableTotal = dynamicTotal > 0 ? dynamicTotal : baseTotal;

            const bookingResponse = await fetch(`${apiUrl}/booking/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    customer_id: profileId,
                    cuisine_type: orderItems[0]?.cuisine_type || 'Mixed',
                    meal_type: getMealType(selectedHour),
                    event_type: 'dinner',
                    booking_date: deliveryDateTime.toISOString().split('T')[0],
                    booking_time: deliveryDateTime.toTimeString().split(' ')[0].substring(0, 5),
                    produce_supply: 'chef',
                    number_of_people: orderItems.reduce((sum, item) => sum + item.quantity, 0),
                    base_price: Number(baseTotal.toFixed(2)),
                    dynamic_price: Number(payableTotal.toFixed(2)),
                    pricing_multiplier: Number(quoteMultiplier.toFixed(2)),
                    pricing_features: pricingQuote?.features_logged || {},
                    total_cost: Number(payableTotal.toFixed(2)),
                    special_notes: `Order: ${orderItems.map(i => `${i.dish_name} (x${i.quantity})`).join(', ')}. Total: $${payableTotal.toFixed(2)}.`
                }),
            });
            const bookingResult = await bookingResponse.json();
            if (!bookingResponse.ok) { Alert.alert('Booking Error', bookingResult.error || 'Booking failed.'); setPaymentProcessing(false); return; }

            const bookChefResponse = await fetch(`${apiUrl}/booking/book-chef`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ booking_id: bookingResult.booking_id, chef_id: parseInt(id, 10) }),
            });
            const bookChefResult = await bookChefResponse.json();
            if (!bookChefResponse.ok) { Alert.alert('Booking Error', bookChefResult.error || 'Chef booking failed.'); setPaymentProcessing(false); return; }
         
            console.log('Sending payment with booking_id:', bookingResult.booking_id, 'token:', token?.substring(0, 20));
            const paymentResponse = await fetch(`${apiUrl}/stripe-payment/create-payment-intent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ booking_id: bookingResult.booking_id }),
            });
            const paymentData = await paymentResponse.json();
            if (paymentResponse.status === 403) {
                Alert.alert('Transaction Declined', 'Flagged for suspicious activity. Please contact support.');
                setPaymentProcessing(false);
                return;
            }
            if (!paymentResponse.ok) { Alert.alert('Payment Failed', paymentData.error || 'Failed to process payment.'); setPaymentProcessing(false); return; }

            setShowOrderModal(false);
            setPaymentProcessing(false);
            const selectedCard = paymentMethods.find(pm => pm.id === selectedPaymentMethod);
            Alert.alert('Booking Confirmed! 🎉',
                `Booking #${bookingResult.booking_id}\nAmount: $${payableTotal.toFixed(2)}\nCard: ${selectedCard?.brand?.toUpperCase()} •••• ${selectedCard?.last4}\nDelivery: ${deliveryDateTime.toLocaleString('en-US')}`,
                [{ text: 'OK', onPress: () => { setOrderItems([]); setSelectedPaymentMethod(null); } }]
            );
        } catch (error) { Alert.alert('Error', 'Network error.'); setPaymentProcessing(false); }
    };

    const orderTotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const quoteFinal = Number(pricingQuote?.final_price || orderTotal);
    const quoteMultiplier = Number(pricingQuote?.multiplier || 1);
    const rushFee = Math.max(0, quoteFinal - orderTotal);

    useEffect(() => {
        if (!showOrderModal || !orderItems.length || !eventZip || !profileId) return;

        const eventDate = new Date(selectedYear, selectedMonth, selectedDay, selectedHour, selectedMinute);
        const basePrice = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        if (!basePrice || Number.isNaN(basePrice)) return;

        let isMounted = true;
        const timeoutId = setTimeout(async () => {
            setPricingLoading(true);
            try {
                const response = await fetch(`${apiUrl}/api/v1/pricing/quote`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({
                        base_price: Number(basePrice.toFixed(2)),
                        event_date: eventDate.toISOString(),
                        location_zip: eventZip,
                        chef_id: Number(id),
                        customer_id: profileId,
                    }),
                });
                const data = await response.json();
                if (!isMounted) return;
                if (response.ok && data?.quote) {
                    setPricingQuote(data.quote);
                    if (Number(data.quote.multiplier) > 1.0 && !hasShownSurgeAlertRef.current) {
                        hasShownSurgeAlertRef.current = true;
                        const fee = Math.max(0, Number(data.quote.final_price || basePrice) - basePrice);
                        Alert.alert('High Demand Pricing', `High Demand: $${fee.toFixed(2)} rush fee applied.`);
                    }
                    if (Number(data.quote.multiplier) <= 1.0) {
                        hasShownSurgeAlertRef.current = false;
                    }
                }
            } catch (_) {
                // Pricing is best-effort; checkout can still continue at base price.
            } finally {
                if (isMounted) setPricingLoading(false);
            }
        }, 350);

        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
        };
    }, [showOrderModal, selectedYear, selectedMonth, selectedDay, selectedHour, selectedMinute, eventZip, orderItems, apiUrl, token, id, profileId]);

    if (loading) {
        return (
            <>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={[s.screen, { justifyContent: 'center', alignItems: 'center' }]}>
                    <LoadingIcon message="Loading Chef Menu..." />
                </View>
            </>
        );
    }

    return (
        <>
            <Stack.Screen options={{ headerShown: false, contentStyle: { backgroundColor: BG } }} />
            <ScrollView style={s.screen} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

                {/* Chef Header */}
                <View style={s.chefHeader}>
                    <View style={s.chefHeaderTop}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.chefName}>{chefData?.first_name} {chefData?.last_name}</Text>
                            {chefData?.meal_timings?.length > 0 && (
                                <Text style={s.chefAvail}>Available: {chefData.meal_timings.join(', ')}</Text>
                            )}
                        </View>
                        <ProfilePicture photoUrl={chefData?.photo_url} firstName={chefData?.first_name} lastName={chefData?.last_name} size={18} />
                    </View>
                    <View style={s.chefHeaderBottom}>
                        <RatingsDisplay rating={chefData?.average_rating} />
                        {chefData?.cuisines?.length > 0 && (
                            <View style={s.cuisineRow}>
                                {chefData.cuisines.slice(0, 4).map((c, i) => (
                                    <View key={i} style={s.cuisineTag}><Text style={s.cuisineTagText}>{c}</Text></View>
                                ))}
                            </View>
                        )}
                        <Text style={s.lastUpdated}>Last Updated: {chefData?.member_since}</Text>
                    </View>
                </View>

                {/* Featured Dishes */}
                {featuredItems.length > 0 && (
                    <SectionCard title="Featured Dishes" defaultExpanded={true}>
                        {featuredItems.map(item => <MenuItemCard key={item.id} item={item} onAddToOrder={handleAddToOrder} apiUrl={apiUrl} userType={userType} />)}
                    </SectionCard>
                )}

                {/* Categories */}
                {categories.map(category => {
                    const items = itemsByCategory[category.id]?.items || [];
                    if (items.length === 0) return null;
                    return (
                        <SectionCard key={category.id} title={category.category_name} defaultExpanded={false}>
                            {items.map(item => <MenuItemCard key={item.id} item={item} onAddToOrder={handleAddToOrder} apiUrl={apiUrl} userType={userType} />)}
                        </SectionCard>
                    );
                })}

                {/* Uncategorized */}
                {itemsByCategory['uncategorized']?.items?.length > 0 && (
                    <SectionCard title="Other Dishes" defaultExpanded={false}>
                        {itemsByCategory['uncategorized'].items.map(item => <MenuItemCard key={item.id} item={item} onAddToOrder={handleAddToOrder} apiUrl={apiUrl} userType={userType} />)}
                    </SectionCard>
                )}

                {menuItems.length === 0 && (
                    <View style={s.sectionCard}>
                        <Text style={[s.menuItemDesc, { textAlign: 'center', padding: 24 }]}>No menu items available yet</Text>
                    </View>
                )}

                {/* Order Summary */}
                {orderItems.length > 0 && (
                    <View style={[s.sectionCard, { borderColor: GREEN, borderWidth: 2 }]}>
                        <View style={s.sectionHeader}>
                            <Text style={s.sectionTitle}>My Selection ({orderItems.length} {orderItems.length === 1 ? 'item' : 'items'})</Text>
                        </View>
                        <View style={s.sectionBody}>
                            {orderItems.map((item, index) => (
                                <View key={index} style={s.orderRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.orderItemName}>{item.dish_name}</Text>
                                        <Text style={s.orderItemMeta}>${item.price?.toFixed(2)} × {item.quantity}</Text>
                                    </View>
                                    <View style={s.qtyRow}>
                                        <TouchableOpacity style={s.qtyBtn} onPress={() => {
                                            if (item.quantity > 1) setOrderItems(orderItems.map(o => o.id === item.id ? { ...o, quantity: o.quantity - 1 } : o));
                                            else setOrderItems(orderItems.filter(o => o.id !== item.id));
                                        }}>
                                            <Octicons name="dash" size={14} color={GREEN} />
                                        </TouchableOpacity>
                                        <Text style={s.qtyText}>{item.quantity}</Text>
                                        <TouchableOpacity style={s.qtyBtn} onPress={() => setOrderItems(orderItems.map(o => o.id === item.id ? { ...o, quantity: o.quantity + 1 } : o))}>
                                            <Octicons name="plus" size={14} color={GREEN} />
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={s.orderItemTotal}>${(item.price * item.quantity).toFixed(2)}</Text>
                                </View>
                            ))}
                            <View style={s.orderTotalRow}>
                                <Text style={s.orderTotalLabel}>Total:</Text>
                                <Text style={s.orderTotalAmount}>${orderTotal.toFixed(2)}</Text>
                            </View>
                            <TouchableOpacity style={s.placeOrderBtn} onPress={() => setShowOrderModal(true)} activeOpacity={0.85}>
                                <Text style={s.placeOrderBtnText}>Place Booking</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                <TouchableOpacity style={[s.returnBtn, { marginTop: 8 }]} onPress={() => router.back()} activeOpacity={0.85}>
                    <Text style={s.returnBtnText}>← Return</Text>
                </TouchableOpacity>

                {/* Order Modal */}
                <Modal visible={showOrderModal} transparent animationType="fade" onRequestClose={() => setShowOrderModal(false)}>
                    <View style={s.modalOverlay}>
                        <View style={s.modalCard}>
                            <Text style={s.modalTitle}>Select Booking Date & Time</Text>

                            {/* Summary */}
                            <View style={s.modalSection}>
                                <Text style={s.modalSectionLabel}>Booking Summary</Text>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                                    <Text style={s.modalText}>Items: {orderItems.length}</Text>
                                    <Text style={[s.modalText, { fontWeight: '700', color: GREEN }]}>
                                        ${quoteFinal.toFixed(2)}
                                    </Text>
                                </View>
                                {quoteMultiplier > 1.0 ? (
                                    <View style={s.surgeBadge}>
                                        <Text style={s.surgeBadgeText}>
                                            High Demand: ${rushFee.toFixed(2)} rush fee applied
                                        </Text>
                                    </View>
                                ) : null}
                                {pricingLoading ? <Text style={[s.modalText, { marginTop: 6 }]}>Refreshing live quote...</Text> : null}
                            </View>

                            {/* Date */}
                            <View style={s.modalSection}>
                                <Text style={s.modalSectionLabel}>Booking Date</Text>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.pickerLabel}>Month</Text>
                                        <Picker selectedValue={selectedMonth} onValueChange={setSelectedMonth} style={s.picker}>
                                            {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => <Picker.Item key={i} label={m} value={i} />)}
                                        </Picker>
                                    </View>
                                    <View style={{ flex: 0.6 }}>
                                        <Text style={s.pickerLabel}>Day</Text>
                                        <Picker selectedValue={selectedDay} onValueChange={setSelectedDay} style={s.picker}>
                                            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <Picker.Item key={d} label={String(d)} value={d} />)}
                                        </Picker>
                                    </View>
                                    <View style={{ flex: 0.8 }}>
                                        <Text style={s.pickerLabel}>Year</Text>
                                        <Picker selectedValue={selectedYear} onValueChange={setSelectedYear} style={s.picker}>
                                            <Picker.Item label="2025" value={2025} />
                                            <Picker.Item label="2026" value={2026} />
                                        </Picker>
                                    </View>
                                </View>
                            </View>

                            {/* Time */}
                            <View style={s.modalSection}>
                                <Text style={s.modalSectionLabel}>Time</Text>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.pickerLabel}>Hour</Text>
                                        <Picker selectedValue={selectedHour} onValueChange={setSelectedHour} style={s.picker}>
                                            {Array.from({ length: 24 }, (_, i) => i).map(h => <Picker.Item key={h} label={String(h).padStart(2, '0')} value={h} />)}
                                        </Picker>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.pickerLabel}>Minute</Text>
                                        <Picker selectedValue={selectedMinute} onValueChange={setSelectedMinute} style={s.picker}>
                                            {[0, 15, 30, 45].map(m => <Picker.Item key={m} label={String(m).padStart(2, '0')} value={m} />)}
                                        </Picker>
                                    </View>
                                </View>
                            </View>

                            {/* Event location */}
                            <View style={s.modalSection}>
                                <Text style={s.modalSectionLabel}>Event Location ZIP</Text>
                                <TextInput
                                    value={eventZip}
                                    onChangeText={setEventZip}
                                    placeholder="e.g. 10001"
                                    keyboardType="number-pad"
                                    maxLength={5}
                                    style={s.zipInput}
                                />
                            </View>

                            {/* Payment */}
                            <View style={s.modalSection}>
                                <Text style={s.modalSectionLabel}>Payment Method</Text>
                                {loadingPaymentMethods ? <LoadingIcon icon="spinner" size={40} message="" /> :
                                paymentMethods.length === 0 ? (
                                    <View>
                                        <Text style={[s.modalText, { textAlign: 'center', marginBottom: 8 }]}>No payment methods available</Text>
                                        <TouchableOpacity style={s.returnBtn} onPress={() => { setShowOrderModal(false); router.push('/(tabs)/Profile'); }}>
                                            <Text style={s.returnBtnText}>Add Card in Profile</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    paymentMethods.map(method => (
                                        <TouchableOpacity key={method.id} onPress={() => setSelectedPaymentMethod(method.id)}
                                            style={[s.paymentRow, selectedPaymentMethod === method.id && s.paymentRowSelected]}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.paymentCardNum}>{method.brand.toUpperCase()} •••• {method.last4}</Text>
                                                <Text style={s.paymentCardMeta}>Expires {method.exp_month}/{method.exp_year}</Text>
                                            </View>
                                            <View style={[s.radio, selectedPaymentMethod === method.id && s.radioSelected]}>
                                                {selectedPaymentMethod === method.id && <View style={s.radioDot} />}
                                            </View>
                                        </TouchableOpacity>
                                    ))
                                )}
                            </View>

                            {/* Actions */}
                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                                <TouchableOpacity style={[s.returnBtn, { flex: 1 }]} onPress={() => setShowOrderModal(false)} disabled={paymentProcessing}>
                                    <Text style={s.returnBtnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[s.placeOrderBtn, { flex: 1 }, (paymentProcessing || !paymentMethods.length) && { backgroundColor: '#c8ddd0' }]}
                                    onPress={handlePlaceOrder} disabled={paymentProcessing || !paymentMethods.length} activeOpacity={0.85}>
                                    <Text style={s.placeOrderBtnText}>{paymentProcessing ? 'Processing...' : 'Confirm & Pay'}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </ScrollView>
        </>
    );
}

const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: BG },
    chefHeader: {
        backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: BORDER,
        marginBottom: 16, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    },
    chefHeaderTop: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: 16, paddingBottom: 12,
    },
    chefName: { fontSize: 22, fontWeight: '800', color: TEXT, letterSpacing: -0.5 },
    chefAvail: { fontSize: 13, color: TEXT_SOFT, marginTop: 3 },
    chefHeaderBottom: {
        padding: 14, paddingTop: 0,
        borderTopWidth: 1, borderTopColor: BORDER,
        paddingTop: 12,
    },
    cuisineRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    cuisineTag: { backgroundColor: GREEN_LIGHT, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    cuisineTagText: { fontSize: 12, fontWeight: '600', color: GREEN },
    lastUpdated: { fontSize: 12, color: TEXT_SOFT, marginTop: 8 },
    sectionCard: {
        backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: BORDER,
        marginBottom: 14, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    },
    sectionHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: BORDER,
    },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: TEXT },
    sectionBody: { padding: 12 },
    menuCard: {
        backgroundColor: '#f8faf8', borderRadius: 12, borderWidth: 1, borderColor: BORDER,
        marginBottom: 10, padding: 12,
    },
    menuItemName: {
        fontSize: 15, fontWeight: '700', color: TEXT, textAlign: 'center',
        paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 10,
    },
    menuItemBody: { flexDirection: 'row', marginBottom: 8 },
    menuItemDesc: { fontSize: 13, color: TEXT_MID, lineHeight: 18, marginBottom: 4 },
    menuItemMeta: { fontSize: 12, color: TEXT_SOFT, marginBottom: 2 },
    menuItemImage: { width: 130, height: 120, borderRadius: 10 },
    menuItemImageEmpty: { backgroundColor: GREEN_LIGHT, alignItems: 'center', justifyContent: 'center' },
    menuItemImageEmptyText: { fontSize: 12, color: GREEN, fontWeight: '600' },
    menuItemFooter: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER, marginBottom: 10,
    },
    menuItemFooterMeta: { fontSize: 12, color: TEXT_SOFT },
    menuItemPrice: { fontSize: 18, fontWeight: '800', color: GREEN },
    addBtn: {
        backgroundColor: GREEN, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    },
    addBtnDisabled: { backgroundColor: '#e2ece2' },
    addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    addBtnTextDisabled: { color: TEXT_SOFT },
    orderRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: BORDER,
    },
    orderItemName: { fontSize: 14, fontWeight: '600', color: TEXT },
    orderItemMeta: { fontSize: 12, color: TEXT_SOFT, marginTop: 2 },
    qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12 },
    qtyBtn: {
        width: 30, height: 30, borderRadius: 15, backgroundColor: GREEN_LIGHT,
        alignItems: 'center', justifyContent: 'center',
    },
    qtyText: { fontSize: 16, fontWeight: '700', color: TEXT, minWidth: 20, textAlign: 'center' },
    orderItemTotal: { fontSize: 14, fontWeight: '700', color: GREEN, minWidth: 52, textAlign: 'right' },
    orderTotalRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 12, marginTop: 4,
    },
    orderTotalLabel: { fontSize: 16, fontWeight: '700', color: TEXT },
    orderTotalAmount: { fontSize: 20, fontWeight: '800', color: GREEN },
    placeOrderBtn: {
        backgroundColor: GREEN, paddingVertical: 14, borderRadius: 12,
        alignItems: 'center', marginTop: 12,
        shadowColor: GREEN, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3,
    },
    placeOrderBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    returnBtn: {
        paddingVertical: 13, borderRadius: 12, alignItems: 'center',
        borderWidth: 1.5, borderColor: BORDER, backgroundColor: '#fff',
    },
    returnBtnText: { color: TEXT_MID, fontWeight: '600', fontSize: 14 },
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalCard: {
        backgroundColor: '#fff', borderRadius: 20, padding: 20,
        width: '92%', maxWidth: 420,
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
    },
    modalTitle: { fontSize: 18, fontWeight: '800', color: TEXT, textAlign: 'center', marginBottom: 16 },
    modalSection: {
        backgroundColor: '#f8faf8', borderRadius: 12, borderWidth: 1, borderColor: BORDER,
        padding: 12, marginBottom: 10,
    },
    modalSectionLabel: { fontSize: 13, fontWeight: '700', color: TEXT_MID, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
    modalText: { fontSize: 14, color: TEXT_MID },
    surgeBadge: {
        marginTop: 8,
        backgroundColor: '#fde68a',
        borderColor: '#f59e0b',
        borderWidth: 1,
        borderRadius: 8,
        paddingVertical: 6,
        paddingHorizontal: 10,
    },
    surgeBadgeText: { fontSize: 12, fontWeight: '700', color: '#92400e' },
    pickerLabel: { fontSize: 11, color: TEXT_SOFT, marginBottom: 2 },
    picker: { backgroundColor: '#fff', borderRadius: 8 },
    zipInput: {
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: '#fff',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: TEXT,
        fontSize: 14,
        fontWeight: '600',
    },
    paymentRow: {
        flexDirection: 'row', alignItems: 'center', padding: 10,
        borderRadius: 10, borderWidth: 1, borderColor: BORDER,
        backgroundColor: '#fff', marginTop: 6,
    },
    paymentRowSelected: { borderColor: GREEN, backgroundColor: '#f0f7f0' },
    paymentCardNum: { fontSize: 14, fontWeight: '600', color: TEXT },
    paymentCardMeta: { fontSize: 12, color: TEXT_SOFT, marginTop: 2 },
    radio: {
        width: 20, height: 20, borderRadius: 10, borderWidth: 2,
        borderColor: BORDER, alignItems: 'center', justifyContent: 'center',
    },
    radioSelected: { borderColor: GREEN },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: GREEN },
});