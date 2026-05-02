import React, { useEffect, useState, useMemo } from 'react';
import { Stack, useRouter } from 'expo-router';
import { ScrollView, Text, View, TouchableOpacity, StyleSheet } from "react-native";
import { Octicons } from '@expo/vector-icons';

import getEnvVars from "../config";
import { useAuth } from "./context/AuthContext";

import LoadingIcon from "./components/LoadingIcon";
import ChefMenuItem, { FIXED_SECTIONS, sectionToMealType } from './components/ChefMenuItem';

const GREEN      = '#2d6a4f';
const GREEN_LIGHT= '#d8f3dc';
const BG         = '#fefce8';
const BORDER     = '#e2ece2';
const TEXT       = '#1a2e1a';
const TEXT_MID   = '#4a7c59';
const TEXT_SOFT  = '#8aab8a';

const deriveSectionId = (item) => {
    if (!item) return 'Specialties';
    if (item.meal_type === 'Any')       return 'Specialties';
    if (item.meal_type === 'Breakfast') return 'Breakfast';
    if (item.meal_type === 'Lunch')     return 'Lunch';
    if (item.meal_type === 'Dinner')    return 'Dinner';
    const cn = item.category_name || '';
    return FIXED_SECTIONS.find(s => s.id === cn) ? cn : 'Specialties';
};

export default function ChefMenu() {
    const { token, profileId } = useAuth();
    const { apiUrl } = getEnvVars();
    const router = useRouter();

    const [chefData,  setChefData]  = useState(null);
    const [menuItems, setMenuItems] = useState([]);
    const [showDraft, setShowDraft] = useState(false);
    const [loading,   setLoading]   = useState(true);

    const itemsBySection = useMemo(() => {
        const grouped = {};
        FIXED_SECTIONS.forEach(sec => { grouped[sec.id] = []; });
        menuItems.forEach(item => {
            const sid = deriveSectionId(item);
            grouped[sid]?.push(item);
        });
        return grouped;
    }, [menuItems]);

    const fetchMenuData = async () => {
        if (!profileId) return;
        setLoading(true);
        try {
            const [profileRes, menuRes] = await Promise.all([
                fetch(`${apiUrl}/profile/chef/${profileId}/public`, {
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                }),
                fetch(`${apiUrl}/api/menu/chef/${profileId}?show_all=true`, {
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                }),
            ]);
            const [profileData, menuData] = await Promise.all([profileRes.json(), menuRes.json()]);
            if (profileRes.ok) setChefData(profileData.profile);
            if (menuRes.ok)    setMenuItems(menuData.menu_items || []);
        } catch (_) {}
        finally { setLoading(false); }
    };

    useEffect(() => { fetchMenuData(); }, [profileId, apiUrl, token]);

    /**
     * actionType options:
     *   'DELETE'       — remove item by id
     *   'POST_SUCCESS' — add brand-new item; payload has the full item object
     *   'PUT'          — update existing item in place; payload has the full updated item
     *   anything else  — full refetch fallback
     */
    const handleItemUpdate = (itemId, actionType, payload) => {
        if (actionType === 'DELETE') {
            setMenuItems(prev => prev.filter(i => i.id !== itemId));
            return;
        }

        if (actionType === 'POST_SUCCESS' && payload) {
            // Insert new item directly — section is correct immediately
            setMenuItems(prev => [...prev, payload]);
            setShowDraft(false);
            return;
        }

        if (actionType === 'PUT' && payload) {
            // Replace the old item with updated data — section moves instantly
            setMenuItems(prev => prev.map(i => i.id === itemId ? { ...i, ...payload } : i));
            return;
        }

        // Fallback: full refetch
        fetchMenuData();
    };

    const draftItem = useMemo(() => ({
        id:           -Date.now(),
        chef_id:      profileId,
        dish_name:    '',
        description:  '',
        photo_url:    null,
        servings:     1,
        cuisine_type: null,
        dietary_info: [],
        spice_level:  null,
        display_order:menuItems.length,
        price:        0.00,
        prep_time:    15,
        meal_type:    null,
        category_name:null,
        is_new_draft: true,
    }), [profileId, menuItems.length]);

    return (
        <>
            <Stack.Screen options={{ headerShown: false, contentStyle: { backgroundColor: BG } }} />
            <ScrollView style={s.screen} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

                <View style={s.pageHeader}>
                    <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                        <Octicons name="chevron-left" size={22} color={GREEN} />
                    </TouchableOpacity>
                    <Text style={s.pageTitle}>Menu</Text>
                    <View style={{ width: 38 }} />
                </View>

                {loading ? (
                    <View style={s.card}>
                        <View style={{ padding: 32 }}>
                            <LoadingIcon message="Loading Your Menu..." icon="spinner" />
                        </View>
                    </View>
                ) : (
                    <>
                        {FIXED_SECTIONS.map(section => {
                            const items = itemsBySection[section.id] || [];
                            return (
                                <View key={section.id} style={s.card}>
                                    <View style={[s.cardHeader, { backgroundColor: section.color }]}>
                                        <View>
                                            <Text style={[s.cardHeaderTitle, { color: section.textColor }]}>
                                                {section.label}
                                            </Text>
                                            <Text style={[s.cardHeaderSub, { color: section.textColor }]}>
                                                {section.subtitle}
                                            </Text>
                                        </View>
                                        <View style={[s.itemCount, { borderColor: section.textColor }]}>
                                            <Text style={[s.itemCountTxt, { color: section.textColor }]}>
                                                {items.length + ' item' + (items.length !== 1 ? 's' : '')}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={{ padding: 12 }}>
                                        {items.length === 0 ? (
                                            <Text style={s.emptyTxt}>No items in this section yet</Text>
                                        ) : null}
                                        {items.map(item => (
                                            <ChefMenuItem
                                                key={item.id}
                                                item={item}
                                                onItemUpdate={handleItemUpdate}
                                                cuisineTypes={chefData?.cuisines || []}
                                            />
                                        ))}
                                    </View>
                                </View>
                            );
                        })}

                        {/* Draft form */}
                        {showDraft ? (
                            <View style={s.card}>
                                <View style={[s.cardHeader, { backgroundColor: GREEN_LIGHT }]}>
                                    <View>
                                        <Text style={[s.cardHeaderTitle, { color: GREEN }]}>New Item</Text>
                                        <Text style={[s.cardHeaderSub, { color: GREEN }]}>Choose a section in the form below</Text>
                                    </View>
                                </View>
                                <View style={{ padding: 12 }}>
                                    <ChefMenuItem
                                        key={draftItem.id}
                                        item={draftItem}
                                        onItemUpdate={handleItemUpdate}
                                        cuisineTypes={chefData?.cuisines || []}
                                        isNewDraft={true}
                                        onCancelNew={() => setShowDraft(false)}
                                    />
                                </View>
                            </View>
                        ) : (
                            <TouchableOpacity style={s.addItemBtn} onPress={() => setShowDraft(true)} activeOpacity={0.85}>
                                <View style={s.addItemBtnIcon}>
                                    <Octicons name="plus" size={18} color={GREEN} />
                                </View>
                                <Text style={s.addItemBtnTxt}>Add New Item</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity style={[s.primaryBtn, { marginTop: 12 }]} onPress={() => router.push(`/ChefMenu/${profileId}`)} activeOpacity={0.85}>
                            <Text style={s.primaryBtnTxt}>Customer View</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.outlineBtn, { marginTop: 10 }]} onPress={() => router.back()} activeOpacity={0.85}>
                            <Text style={s.outlineBtnTxt}>← Return</Text>
                        </TouchableOpacity>
                    </>
                )}
            </ScrollView>
        </>
    );
}

const s = StyleSheet.create({
    screen:          { flex: 1, backgroundColor: BG },
    pageHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    backBtn:         { width: 38, height: 38, borderRadius: 19, backgroundColor: GREEN_LIGHT, alignItems: 'center', justifyContent: 'center' },
    pageTitle:       { fontSize: 20, fontWeight: '800', color: TEXT, letterSpacing: -0.5 },
    card:            { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: BORDER, marginBottom: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
    cardHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
    cardHeaderTitle: { fontSize: 16, fontWeight: '800' },
    cardHeaderSub:   { fontSize: 12, fontWeight: '500', marginTop: 1, opacity: 0.85 },
    itemCount:       { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    itemCountTxt:    { fontSize: 12, fontWeight: '700' },
    emptyTxt:        { fontSize: 14, color: TEXT_SOFT, textAlign: 'center', paddingVertical: 12 },
    addItemBtn:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5, borderColor: GREEN, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 16, shadowColor: GREEN, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
    addItemBtnIcon:  { width: 36, height: 36, borderRadius: 18, backgroundColor: GREEN_LIGHT, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    addItemBtnTxt:   { fontSize: 16, fontWeight: '700', color: GREEN },
    primaryBtn:      { backgroundColor: GREEN, paddingVertical: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center', shadowColor: GREEN, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3 },
    primaryBtnTxt:   { color: '#fff', fontSize: 15, fontWeight: '700' },
    outlineBtn:      { paddingVertical: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1.5, borderColor: BORDER, backgroundColor: '#fff' },
    outlineBtnTxt:   { color: TEXT_MID, fontSize: 14, fontWeight: '600' },
});