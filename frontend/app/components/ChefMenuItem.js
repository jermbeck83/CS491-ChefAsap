import React, { useState } from 'react';
import { View, Text, Alert, ScrollView, Image, TouchableOpacity, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Octicons from '@expo/vector-icons/Octicons';

import getEnvVars from "../../config";
import { useAuth } from "../context/AuthContext";

import LoadingIcon from './LoadingIcon';
import Input from './Input';
import Stepper from './Stepper';
import CustomPicker from './Picker';

const GREEN = '#2d6a4f';
const GREEN_LIGHT = '#d8f3dc';
const BG = '#fefce8';
const BORDER = '#e2ece2';
const TEXT = '#1a2e1a';
const TEXT_MID = '#4a7c59';
const TEXT_SOFT = '#8aab8a';

const spiceOptions = [
    { label: "Select Spice Level...", value: null },
    { label: "None", value: "None" },
    { label: "Mild", value: "Mild" },
    { label: "Medium", value: "Medium" },
    { label: "Hot", value: "Hot" },
    { label: "Volcanic", value: "Volcanic" },
];

const dietaryOptions = [
    { label: "Select Dietary Info...", value: null },
    { label: "Vegan", value: "Vegan" },
    { label: "Vegetarian", value: "Vegetarian" },
    { label: "Gluten-Free", value: "Gluten-Free" },
    { label: "Dairy-Free", value: "Dairy-Free" },
];

const convertToPickerOptions = (arr, prompt = "Select Option...") => [
    { label: prompt, value: null },
    ...(arr || []).map(item => ({ label: item, value: item }))
];

const getImageSource = (photoUrl, apiUrl) => {
    if (!photoUrl) return null;
    if (photoUrl.startsWith('data:')) return { uri: photoUrl };
    return { uri: `${apiUrl}${photoUrl}` };
};

export default function ChefMenuItem({
    item: initialItem, onItemUpdate, isNewDraft = false,
    onCancelNew, cuisineTypes = [], categories = [],
}) {
    const { token } = useAuth();
    const { apiUrl } = getEnvVars();

    const [item, setItem] = useState(initialItem);
    const [editing, setEditing] = useState(isNewDraft);
    const [categoryUpdated, setCategoryUpdated] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [availabilityLoading, setAvailabilityLoading] = useState(false);
    const [featureLoading, setFeatureLoading] = useState(false);
    const [loading, setLoading] = useState(false);

    const [form, setForm] = useState({
        dish_name: initialItem?.dish_name || '',
        description: initialItem?.description || '',
        photo_url: initialItem?.photo_url || '',
        is_available: initialItem?.is_available ?? true,
        is_featured: initialItem?.is_featured || false,
        servings: initialItem?.servings || 1,
        cuisine_type: initialItem?.cuisine_type || null,
        dietary_info: initialItem?.dietary_info || null,
        spice_level: initialItem?.spice_level || 'None',
        display_order: initialItem?.display_order || 0,
        price: initialItem?.price?.toString() || '0.00',
        prep_time: initialItem?.prep_time || 15,
        category_id: initialItem?.category_id || null,
    });

    const cuisineOptions = convertToPickerOptions(cuisineTypes, "Select Cuisine Type...");
    const categoryList = [...categories.map(c => ({ label: c.category_name, value: c.id })), { label: 'Other', value: null }];

    const handleChange = (name, value) => {
        if (name === 'category_id' && value !== form.category_id) setCategoryUpdated(true);
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const sendMenuItemRequest = async (method, body = null) => {
        setLoading(true);
        try {
            const response = await fetch(`${apiUrl}/api/menu/item/${item.id}`, {
                method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                ...(method === 'PUT' && body ? { body: JSON.stringify(body) } : {}),
            });
            const data = await response.json();
            setLoading(false);
            if (!response.ok || !data.success) { Alert.alert("Failed", data.error || `Failed to ${method} item.`); return false; }
            if (onItemUpdate) onItemUpdate(item.id, method);
            return true;
        } catch (e) { setLoading(false); return false; }
    };

    const addMenuItemRequest = async (body) => {
        setLoading(true);
        try {
            const response = await fetch(`${apiUrl}/api/menu/chef/${item.chef_id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            const data = await response.json();
            setLoading(false);
            if (!response.ok || !data.success) { Alert.alert("Failed", data.error || "Failed to add item."); return false; }
            onItemUpdate(data.item_id, 'POST_SUCCESS');
            return true;
        } catch (e) { setLoading(false); Alert.alert("Network Error", "Could not connect."); return false; }
    };

    const handleUpdateItem = async () => {
        const payload = { ...form, price: parseFloat(form.price).toFixed(2) };
        if (!payload.dish_name) { Alert.alert("Missing Field", "Dish Name is required."); return; }
        let success = isNewDraft ? await addMenuItemRequest(payload) : await sendMenuItemRequest('PUT', payload);
        if (success && !isNewDraft) {
            setItem(prev => ({ ...prev, ...payload, price: parseFloat(payload.price) }));
            setEditing(false);
            if (categoryUpdated) { onItemUpdate?.(item.id, 'CATEGORY_UPDATE'); setCategoryUpdated(false); }
        }
    };

    const handleToggleAvailability = async () => {
        setAvailabilityLoading(true);
        const newVal = !item.is_available;
        const success = await sendMenuItemRequest('PUT', { is_available: newVal });
        if (success) setItem(prev => ({ ...prev, is_available: newVal }));
        setAvailabilityLoading(false);
    };

    const handleToggleFeatured = async () => {
        setFeatureLoading(true);
        try {
            const getRes = await fetch(`${apiUrl}/api/menu/chef/${item.chef_id}/featured`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!getRes.ok) throw new Error("Could not fetch featured items.");
            const getData = await getRes.json();
            let featuredIds = getData.featured_items.map(i => i.id);
            const nowFeatured = item.is_featured;
            const newIds = nowFeatured ? featuredIds.filter(id => id !== item.id) : [...new Set([...featuredIds, item.id])];
            const postRes = await fetch(`${apiUrl}/api/menu/chef/${item.chef_id}/featured`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ item_ids: newIds }),
            });
            const postData = await postRes.json();
            if (postRes.ok && postData.success) { setItem(prev => ({ ...prev, is_featured: !nowFeatured })); onItemUpdate?.(item.id, 'FEATURED_UPDATE'); }
            else Alert.alert("Failed", postData.error || "Failed to update featured.");
        } catch (e) { Alert.alert("Error", e.message); }
        finally { setFeatureLoading(false); }
    };

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission denied', 'Gallery access is required.'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7,
        });
        if (!result.canceled && result.assets?.length > 0) {
            setUploading(true);
            const localUri = result.assets[0].uri;
            const filename = localUri.split('/').pop();
            const match = /\.(\w+)$/.exec(filename);
            const type = match ? `image/${match[1]}` : 'image';
            const formData = new FormData();
            formData.append('photo', { uri: localUri, name: filename, type });
            try {
                const response = await fetch(`${apiUrl}/api/menu/upload-photo`, {
                    method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: formData,
                });
                const data = await response.json();
                if (data.photo_url) { setItem(prev => ({ ...prev, photo_url: data.photo_url })); setForm(prev => ({ ...prev, photo_url: data.photo_url })); }
                else Alert.alert('Upload Failed', data.error || 'Failed to upload image');
            } catch (error) { Alert.alert('Error', 'Failed to upload image.'); }
            setUploading(false);
        }
    };

    const handleDeleteItem = async () => {
        Alert.alert("Confirm Deletion", "Delete this menu item?", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: async () => await sendMenuItemRequest('DELETE') },
        ]);
    };

    if (loading) {
        return (
            <View style={[s.card, { padding: 24, alignItems: 'center' }]}>
                <LoadingIcon icon='spinner' size={64} message='' />
            </View>
        );
    }

    if (editing) {
        return (
            <ScrollView style={s.editCard} contentContainerStyle={{ padding: 16 }}>
                <Text style={s.editTitle}>{isNewDraft ? "Add New Item" : `Editing: ${item?.dish_name}`}</Text>

                <TouchableOpacity onPress={pickImage} disabled={uploading} style={s.imagePickerBtn} activeOpacity={0.8}>
                    {item?.photo_url ? (
                        <Image source={getImageSource(item.photo_url, apiUrl)} style={s.imagePreview} resizeMode="cover" />
                    ) : (
                        <View style={s.imagePlaceholder}>
                            <Octicons name="image" size={28} color={TEXT_SOFT} />
                            <Text style={s.imagePlaceholderText}>Tap to add photo</Text>
                        </View>
                    )}
                    {item?.photo_url && (
                        <Text style={s.changePhotoText}>{uploading ? "Uploading..." : "Tap to change photo"}</Text>
                    )}
                </TouchableOpacity>

                <Input label="Dish Name*" value={form.dish_name} onChangeText={t => handleChange('dish_name', t)} />
                <Input label="Description" isTextArea value={form.description} onChangeText={t => handleChange('description', t)} maxLength={500} multiline />
                <Input label="Price ($)" value={form.price} onChangeText={t => handleChange('price', t)} keyboardType="numeric" containerClasses="mb-3" />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Stepper label="Servings" value={form.servings} onValueChange={v => handleChange('servings', v)} min={1} max={10} step={1} size={10} />
                    <Stepper label="Prep Time (min)" value={form.prep_time} onValueChange={v => handleChange('prep_time', v)} min={0} max={120} step={5} size={10} />
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                    <CustomPicker label="Cuisine Type" prompt="Select Cuisine..." selectedValue={form.cuisine_type} onValueChange={v => handleChange('cuisine_type', v)} items={cuisineOptions} />
                    <CustomPicker label="Spice Level" prompt="Select Spice..." selectedValue={form.spice_level} onValueChange={v => handleChange('spice_level', v)} items={spiceOptions} />
                </View>
                <CustomPicker label="Dietary Info" prompt="Select Dietary..." selectedValue={form.dietary_info} onValueChange={v => handleChange('dietary_info', v)} items={dietaryOptions} />
                <CustomPicker label="Category" prompt="Select Category..." selectedValue={form.category_id} onValueChange={v => handleChange('category_id', v)} items={categoryList} customClass="mb-2" />

                <TouchableOpacity style={s.saveBtnPrimary} onPress={handleUpdateItem} activeOpacity={0.85}>
                    <Text style={s.saveBtnPrimaryText}>{isNewDraft ? "Save Item" : "Save Changes"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtnSecondary} onPress={isNewDraft ? onCancelNew : () => setEditing(false)} activeOpacity={0.85}>
                    <Text style={s.saveBtnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
            </ScrollView>
        );
    }

    return (
        <View style={s.card}>
            {/* Featured toggle */}
            <TouchableOpacity onPress={handleToggleFeatured} disabled={featureLoading} style={[s.featuredBtn, item?.is_featured && s.featuredBtnActive]}>
                <Octicons name="flame" size={14} color={item?.is_featured ? '#fff' : TEXT_SOFT} />
            </TouchableOpacity>

            <Text style={s.dishName}>{item?.dish_name || 'Dish Name'}</Text>

            <View style={s.dishBody}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                    {item?.description ? <Text style={s.dishDesc}>{item.description}</Text> : null}
                    {item?.servings ? <Text style={s.dishMeta}>Servings: {item.servings}</Text> : null}
                    {item?.spice_level ? <Text style={s.dishMeta}>Spice Level: {item.spice_level}</Text> : null}
                </View>
                <View style={{ width: 140 }}>
                    {item?.photo_url ? (
                        <Image source={getImageSource(item.photo_url, apiUrl)} style={s.dishImage} resizeMode="cover" />
                    ) : (
                        <View style={[s.dishImage, s.dishImageEmpty]}>
                            <Text style={s.dishImageEmptyText}>NO IMAGE</Text>
                        </View>
                    )}
                </View>
            </View>

            <View style={s.dishFooter}>
                {item?.prep_time ? <Text style={s.dishFooterMeta}>Prep time: {item.prep_time} min</Text> : null}
                {item?.price ? <Text style={s.dishPrice}>${item.price.toFixed(2)}</Text> : null}
            </View>

            <TouchableOpacity
                style={[s.availBtn, item?.is_available ? s.availBtnUnavail : s.availBtnAvail]}
                onPress={handleToggleAvailability} disabled={availabilityLoading} activeOpacity={0.85}
            >
                <Text style={[s.availBtnText, !item?.is_available && { color: GREEN }]}>
                    {availabilityLoading ? 'Updating...' : item?.is_available ? 'Make Unavailable' : 'Make Available'}
                </Text>
            </TouchableOpacity>

            <View style={s.editDeleteRow}>
                <TouchableOpacity style={s.editBtn} onPress={() => setEditing(true)} activeOpacity={0.85}>
                    <Text style={s.editBtnText}>Edit item</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.deleteBtn} onPress={handleDeleteItem} activeOpacity={0.85}>
                    <Octicons name="trash" size={16} color="#ef4444" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    card: {
        backgroundColor: '#fff', borderRadius: 14,
        borderWidth: 1, borderColor: BORDER, marginBottom: 12,
        overflow: 'hidden', padding: 14,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    editCard: {
        backgroundColor: '#fff', borderRadius: 14,
        borderWidth: 1, borderColor: BORDER, marginBottom: 12,
    },
    editTitle: { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 16 },
    imagePickerBtn: { alignItems: 'center', marginBottom: 16 },
    imagePreview: { width: 140, height: 140, borderRadius: 12 },
    imagePlaceholder: {
        width: 140, height: 140, borderRadius: 12,
        backgroundColor: GREEN_LIGHT, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: BORDER,
    },
    imagePlaceholderText: { fontSize: 12, color: TEXT_SOFT, marginTop: 6 },
    changePhotoText: { fontSize: 12, color: TEXT_MID, marginTop: 6, textDecorationLine: 'underline' },
    featuredBtn: {
        position: 'absolute', top: 10, right: 10, zIndex: 10,
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: '#f0f5f0', alignItems: 'center', justifyContent: 'center',
    },
    featuredBtnActive: { backgroundColor: '#f97316' },
    dishName: {
        fontSize: 16, fontWeight: '700', color: TEXT,
        textAlign: 'center', paddingBottom: 10, paddingRight: 32,
        borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 10,
    },
    dishBody: { flexDirection: 'row', marginBottom: 10 },
    dishDesc: { fontSize: 13, color: TEXT_MID, marginBottom: 4, lineHeight: 18 },
    dishMeta: { fontSize: 12, color: TEXT_SOFT, marginBottom: 2 },
    dishImage: { width: 140, height: 130, borderRadius: 10 },
    dishImageEmpty: { backgroundColor: GREEN_LIGHT, alignItems: 'center', justifyContent: 'center' },
    dishImageEmptyText: { fontSize: 12, color: GREEN, fontWeight: '600' },
    dishFooter: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 8, marginBottom: 10,
        borderTopWidth: 1, borderTopColor: BORDER,
    },
    dishFooterMeta: { fontSize: 13, color: TEXT_SOFT },
    dishPrice: { fontSize: 18, fontWeight: '800', color: GREEN },
    availBtn: {
        paddingVertical: 10, borderRadius: 10, alignItems: 'center',
        borderWidth: 1, marginBottom: 8,
    },
    availBtnUnavail: { borderColor: BORDER, backgroundColor: '#fff' },
    availBtnAvail: { borderColor: GREEN_LIGHT, backgroundColor: GREEN_LIGHT },
    availBtnText: { fontSize: 14, fontWeight: '600', color: TEXT_MID },
    editDeleteRow: { flexDirection: 'row', gap: 8 },
    editBtn: {
        flex: 1, paddingVertical: 10, borderRadius: 10,
        backgroundColor: GREEN, alignItems: 'center',
    },
    editBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    deleteBtn: {
        width: 42, height: 42, borderRadius: 10,
        backgroundColor: '#fff0f0', borderWidth: 1, borderColor: '#fecaca',
        alignItems: 'center', justifyContent: 'center',
    },
    saveBtnPrimary: {
        backgroundColor: GREEN, paddingVertical: 14, borderRadius: 12,
        alignItems: 'center', marginBottom: 8,
    },
    saveBtnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    saveBtnSecondary: {
        paddingVertical: 13, borderRadius: 12, alignItems: 'center',
        borderWidth: 1.5, borderColor: BORDER, backgroundColor: '#fff',
    },
    saveBtnSecondaryText: { color: TEXT_MID, fontWeight: '600', fontSize: 14 },
});