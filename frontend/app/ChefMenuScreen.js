import React, { useEffect, useState, useMemo } from 'react';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { ScrollView, Text, View, TouchableOpacity, StyleSheet } from "react-native";
import { Octicons } from '@expo/vector-icons';

import getEnvVars from "../config";
import { useAuth } from "./context/AuthContext";

import LoadingIcon from "./components/LoadingIcon";
import ChefMenuItem from './components/ChefMenuItem';
import ChefCategory from './components/ChefCategory';

const GREEN = '#2d6a4f';
const GREEN_LIGHT = '#d8f3dc';
const BG = '#fefce8';
const BORDER = '#e2ece2';
const TEXT = '#1a2e1a';
const TEXT_MID = '#4a7c59';
const TEXT_SOFT = '#8aab8a';

export default function ChefMenu() {
    const { token, userId, profileId } = useAuth();
    const { apiUrl } = getEnvVars();
    const router = useRouter();

    const [chefData, setChefData] = useState(null);
    const [menuItems, setMenuItems] = useState([]);
    const [newItemDraft, setNewItemDraft] = useState(null);
    const [newSectionDraft, setNewSectionDraft] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [categories, setCategories] = useState([]);

    const itemsByCategory = useMemo(() => {
        const grouped = {};
        categories.forEach(cat => { grouped[cat.id] = { category: cat, items: [] }; });
        grouped['uncategorized'] = { category: { id: null, category_name: 'Uncategorized' }, items: [] };
        menuItems.forEach(item => {
            const catId = item.category_id || 'uncategorized';
            if (grouped[catId]) grouped[catId].items.push(item);
            else grouped['uncategorized'].items.push(item);
        });
        return grouped;
    }, [categories, menuItems]);

    const handleItemUpdate = (itemId, actionType) => {
        if (actionType === 'DELETE') {
            setMenuItems(prev => prev.filter(item => item.id !== itemId));
        } else if (actionType === 'POST_SUCCESS') {
            setNewItemDraft(null);
            refetchMenuData();
        } else if (actionType === 'CATEGORY_UPDATE') {
            refetchMenuData();
        }
    };

    const handleCategoryUpdate = (categoryId, actionType) => {
        if (actionType === 'DELETE') {
            setCategories(categories.filter(c => c.id !== categoryId));
        } else if (actionType === 'POST_SUCCESS') {
            setNewSectionDraft(false);
            refetchMenuData();
        }
    };

    const startNewItemDraft = (sectionId) => {
        setNewItemDraft({
            id: -Date.now(),
            chef_id: profileId,
            dish_name: '', description: '', photo_url: null,
            servings: 1, cuisine_type: null, dietary_info: null,
            spice_level: null, display_order: menuItems.length,
            price: 0.00, prep_time: 15,
            is_new_draft: true, category_id: sectionId || null,
        });
    };

    const fetchMenuData = async () => {
        if (!profileId) return;
        setLoading(true);
        setError(null);
        try {
            const [profileRes, menuRes, catRes] = await Promise.all([
                fetch(`${apiUrl}/profile/chef/${profileId}/public`, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } }),
                fetch(`${apiUrl}/api/menu/chef/${profileId}?show_all=true`, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } }),
                fetch(`${apiUrl}/api/menu/chef/${profileId}/categories`, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } }),
            ]);
            const [profileData, menuData, catData] = await Promise.all([profileRes.json(), menuRes.json(), catRes.json()]);
            if (profileRes.ok) setChefData(profileData.profile);
            if (menuRes.ok) setMenuItems(menuData.menu_items || []);
            if (catRes.ok) setCategories(catData.categories || []);
        } catch (err) {
            setError('Network error. Could not connect to API.');
        } finally {
            setLoading(false);
        }
    };

    const refetchMenuData = async () => {
        if (!profileId) return;
        try {
            const [menuRes, catRes] = await Promise.all([
                fetch(`${apiUrl}/api/menu/chef/${profileId}?show_all=true`, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } }),
                fetch(`${apiUrl}/api/menu/chef/${profileId}/categories`, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } }),
            ]);
            const [menuData, catData] = await Promise.all([menuRes.json(), catRes.json()]);
            if (menuRes.ok) setMenuItems(menuData.menu_items || []);
            if (catRes.ok) setCategories(catData.categories || []);
        } catch (err) {}
    };

    useEffect(() => { fetchMenuData(); }, [profileId, apiUrl, token]);

    const AddItemButton = ({ sectionId }) => (
        <TouchableOpacity
            style={[s.outlineBtn, { marginTop: 10 }]}
            onPress={newItemDraft ? () => setNewItemDraft(null) : () => startNewItemDraft(sectionId)}
            activeOpacity={0.8}
        >
            <Octicons name={newItemDraft ? 'x' : 'plus'} size={15} color={newItemDraft ? '#ef4444' : GREEN} style={{ marginRight: 6 }} />
            <Text style={[s.outlineBtnText, newItemDraft && { color: '#ef4444' }]}>
                {newItemDraft ? 'Cancel Add Item' : 'Add New Menu Item'}
            </Text>
        </TouchableOpacity>
    );

    const uncategorizedSection = () => (
        <>
            {itemsByCategory['uncategorized']?.items?.map(item => (
                <ChefMenuItem key={item.id} item={item} onItemUpdate={handleItemUpdate}
                    cuisineTypes={chefData?.cuisines || []} categories={categories} />
            ))}
            {newItemDraft?.category_id === null ? (
                <ChefMenuItem key={newItemDraft.id} item={newItemDraft} onItemUpdate={handleItemUpdate}
                    cuisineTypes={chefData?.cuisines || []} categories={categories}
                    isNewDraft={true} onCancelNew={() => setNewItemDraft(null)} />
            ) : (
                <AddItemButton sectionId={null} />
            )}
        </>
    );

    return (
        <>
            <Stack.Screen options={{ headerShown: false, contentStyle: { backgroundColor: BG } }} />
            <ScrollView style={s.screen} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

                {/* Header */}
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
                            <LoadingIcon message="Loading Your Menu..." icon='spinner' />
                        </View>
                    </View>
                ) : (
                    <>
                        {categories.map(category => {
                            const categoryItems = itemsByCategory[category.id]?.items || [];
                            return (
                                <ChefCategory
                                    key={category.id}
                                    categoryId={category.id}
                                    initialName={category.category_name}
                                    categoryItems={categoryItems}
                                    chefCuisineTypes={chefData?.cuisines || []}
                                    onItemUpdate={handleItemUpdate}
                                    onCategoryUpdate={handleCategoryUpdate}
                                    categories={categories}
                                >
                                    {newItemDraft?.category_id === category.id ? (
                                        <ChefMenuItem key={newItemDraft.id} item={newItemDraft}
                                            onItemUpdate={handleItemUpdate}
                                            cuisineTypes={chefData?.cuisines || []}
                                            sectionId={category.id} categories={categories}
                                            isNewDraft={true} onCancelNew={() => setNewItemDraft(null)} />
                                    ) : (
                                        <AddItemButton sectionId={category.id} />
                                    )}
                                </ChefCategory>
                            );
                        })}

                        {/* Other / Uncategorized */}
                        {categories.length > 0 ? (
                            <View style={s.card}>
                                <View style={s.cardHeader}>
                                    <Text style={s.cardHeaderText}>Other</Text>
                                </View>
                                <View style={{ padding: 12 }}>
                                    {uncategorizedSection()}
                                </View>
                            </View>
                        ) : uncategorizedSection()}

                        {/* Add New Section */}
                        {newSectionDraft ? (
                            <ChefCategory
                                key={-1} categoryId={null} initialName={"New Category"}
                                categoryItems={[]} chefCuisineTypes={chefData?.cuisines || []}
                                onItemUpdate={handleItemUpdate} onCategoryUpdate={handleCategoryUpdate}
                                isNewDraft={true} categories={categories}
                            />
                        ) : (
                            <TouchableOpacity style={s.primaryBtn} onPress={() => setNewSectionDraft(true)} activeOpacity={0.85}>
                                <Octicons name="plus" size={16} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={s.primaryBtnText}>Add New Section</Text>
                            </TouchableOpacity>
                        )}

                        {/* Footer actions */}
                        <TouchableOpacity style={[s.primaryBtn, { marginTop: 12 }]} onPress={() => router.push(`/ChefMenu/${profileId}`)} activeOpacity={0.85}>
                            <Text style={s.primaryBtnText}>Customer View</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.outlineBtn, { marginTop: 10 }]} onPress={() => router.back()} activeOpacity={0.85}>
                            <Text style={s.outlineBtnText}>← Return</Text>
                        </TouchableOpacity>
                    </>
                )}
            </ScrollView>
        </>
    );
}

const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: BG },
    pageHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20,
    },
    backBtn: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: GREEN_LIGHT, alignItems: 'center', justifyContent: 'center',
    },
    pageTitle: { fontSize: 20, fontWeight: '800', color: TEXT, letterSpacing: -0.5 },
    card: {
        backgroundColor: '#fff', borderRadius: 16,
        borderWidth: 1, borderColor: BORDER, marginBottom: 16, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    },
    cardHeader: {
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: BORDER,
    },
    cardHeaderText: { fontSize: 16, fontWeight: '700', color: TEXT },
    primaryBtn: {
        backgroundColor: GREEN, paddingVertical: 15, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center', flexDirection: 'row',
        shadowColor: GREEN, shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2, shadowRadius: 6, elevation: 3,
    },
    primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    outlineBtn: {
        paddingVertical: 14, borderRadius: 14, alignItems: 'center',
        justifyContent: 'center', flexDirection: 'row',
        borderWidth: 1.5, borderColor: BORDER, backgroundColor: '#fff',
    },
    outlineBtnText: { color: TEXT_MID, fontSize: 14, fontWeight: '600' },
});