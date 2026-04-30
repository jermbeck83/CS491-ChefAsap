import React, { useState } from 'react';
import { View, Text, Alert, TouchableOpacity, StyleSheet } from 'react-native';
import Octicons from '@expo/vector-icons/Octicons';

import getEnvVars from "../../config";
import { useAuth } from "../context/AuthContext";

import LoadingIcon from './LoadingIcon';
import Input from './Input';
import ChefMenuItem from './ChefMenuItem';

const GREEN = '#2d6a4f';
const GREEN_LIGHT = '#d8f3dc';
const BORDER = '#e2ece2';
const TEXT = '#1a2e1a';
const TEXT_MID = '#4a7c59';
const TEXT_SOFT = '#8aab8a';

export default function ChefCategory({
    categoryId, initialName, categoryItems, chefCuisineTypes,
    onItemUpdate, onCategoryUpdate, isNewDraft = false, categories, children
}) {
    const { token, profileId } = useAuth();
    const { apiUrl } = getEnvVars();

    const [categoryName, setCategoryName] = useState(initialName);
    const [renameCategoryName, setRenameCategoryName] = useState(initialName);
    const [editing, setEditing] = useState(isNewDraft);
    const [expanded, setExpanded] = useState(true);
    const [savingCategory, setSavingCategory] = useState(false);

    const handleRenameCategory = async () => {
        const trimmed = renameCategoryName.trim();
        if (isNewDraft && !trimmed) { Alert.alert("Missing Name", "A section name is required."); return; }
        if (!isNewDraft && (!trimmed || trimmed === categoryName)) { setEditing(false); return; }

        if (isNewDraft) {
            try {
                const response = await fetch(`${apiUrl}/api/menu/chef/${profileId}/categories`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ category_name: trimmed }),
                });
                const data = await response.json();
                if (response.ok) {
                    setCategoryName(trimmed);
                    onCategoryUpdate(data.category_id, 'POST_SUCCESS');
                } else {
                    Alert.alert('Error', data.error || 'Failed to create category');
                }
            } catch (err) {
                Alert.alert('Error', 'Network error.');
            }
        } else {
            try {
                setSavingCategory(true);
                const response = await fetch(`${apiUrl}/api/menu/categories/${categoryId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ category_name: trimmed }),
                });
                const data = await response.json();
                if (response.ok) { setCategoryName(trimmed); onCategoryUpdate(categoryId, 'PUT'); }
                else Alert.alert('Error', data.error || 'Failed to rename category');
            } catch (err) {
                Alert.alert('Error', 'Network error.');
            } finally { setSavingCategory(false); setEditing(false); }
        }
    };

    const handleDeleteCategory = async () => {
        Alert.alert('Delete Category', 'Items in this category will become uncategorized.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                    try {
                        const response = await fetch(`${apiUrl}/api/menu/categories/${categoryId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` },
                        });
                        if (response.ok) onCategoryUpdate(categoryId, 'DELETE');
                        else { const d = await response.json(); Alert.alert('Error', d.error || 'Failed to delete'); }
                    } catch (err) { Alert.alert('Error', 'Network error'); }
                }
            }
        ]);
    };

    return (
        <View style={s.card}>
            {/* Header */}
            <View style={s.header}>
                {editing ? (
                    <View style={s.editRow}>
                        <Input
                            value={renameCategoryName}
                            onChangeText={setRenameCategoryName}
                            placeholder="Category Name"
                            maxLength={100}
                            containerClasses="flex-1 mb-0 mr-2"
                        />
                        <TouchableOpacity onPress={() => { if (isNewDraft) { onCategoryUpdate(categoryId, 'DELETE'); } else { setRenameCategoryName(categoryName); setEditing(false); } }} style={s.iconBtn}>
                            <Octicons name="x" size={16} color="#ef4444" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleRenameCategory} style={[s.iconBtn, { backgroundColor: GREEN_LIGHT }]} disabled={savingCategory}>
                            <Octicons name={savingCategory ? 'sync' : 'check'} size={16} color={GREEN} />
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        <TouchableOpacity style={s.headerLeft} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
                            <Text style={s.headerText}>{categoryName}</Text>
                            <Octicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={TEXT_SOFT} style={{ marginLeft: 8 }} />
                        </TouchableOpacity>
                        <View style={s.headerActions}>
                            <TouchableOpacity onPress={() => setEditing(true)} style={s.iconBtn}>
                                <Octicons name="pencil" size={15} color={GREEN} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleDeleteCategory} style={[s.iconBtn, { backgroundColor: '#fff0f0' }]}>
                                <Octicons name="trash" size={15} color="#ef4444" />
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </View>

            {/* Body */}
            {expanded && !isNewDraft && (
                <View style={s.body}>
                    {categoryItems.length > 0 ? (
                        categoryItems.map(item => (
                            <ChefMenuItem key={item.id} item={item} onItemUpdate={onItemUpdate}
                                cuisineTypes={chefCuisineTypes || []} sectionId={categoryId} categories={categories} />
                        ))
                    ) : (
                        <Text style={s.emptyText}>No items in this category yet</Text>
                    )}
                    {children}
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    card: {
        backgroundColor: '#fff', borderRadius: 16,
        borderWidth: 1, borderColor: BORDER, marginBottom: 14, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: BORDER,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    headerText: { fontSize: 16, fontWeight: '700', color: TEXT },
    headerActions: { flexDirection: 'row', gap: 8 },
    editRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
    iconBtn: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: GREEN_LIGHT, alignItems: 'center', justifyContent: 'center',
    },
    body: { padding: 12 },
    emptyText: { fontSize: 14, color: TEXT_SOFT, textAlign: 'center', paddingVertical: 12 },
});