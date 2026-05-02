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

const GREEN      = '#2d6a4f';
const GREEN_LIGHT= '#d8f3dc';
const BORDER     = '#e2ece2';
const TEXT       = '#1a2e1a';
const TEXT_MID   = '#4a7c59';
const TEXT_SOFT  = '#8aab8a';

// ── 4 fixed sections ──────────────────────────────────────────────────────────
export const FIXED_SECTIONS = [
    { id: 'Breakfast',   label: 'Breakfast',   subtitle: '6 AM – 11 AM',  color: '#fef9c3', textColor: '#92400e'  },
    { id: 'Lunch',       label: 'Lunch',       subtitle: '11 AM – 3 PM',  color: '#dcfce7', textColor: '#166534'  },
    { id: 'Dinner',      label: 'Dinner',      subtitle: '5 PM – 11 PM',  color: '#ede9fe', textColor: '#5b21b6'  },
    { id: 'Specialties', label: 'Specialties', subtitle: 'Any time',      color: GREEN_LIGHT, textColor: GREEN    },
];

export const sectionToMealType = (id) => id === 'Specialties' ? 'Any' : id;

const deriveSectionFromItem = (item) => {
    if (!item) return null;
    if (item.meal_type === 'Any')       return 'Specialties';
    if (item.meal_type === 'Breakfast') return 'Breakfast';
    if (item.meal_type === 'Lunch')     return 'Lunch';
    if (item.meal_type === 'Dinner')    return 'Dinner';
    const cn = item.category_name || '';
    return FIXED_SECTIONS.find(s => s.id === cn) ? cn : null;
};

// ── Safely parse dietary_info into a string[] regardless of DB format ─────────
const toArray = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(v => typeof v === 'string' && v.length > 0);
    if (typeof val === 'string') {
        const t = val.trim();
        if (!t || t === '{}' || t === 'null') return [];
        if (t.startsWith('[') || t.startsWith('"')) {
            try {
                const p = JSON.parse(t);
                if (Array.isArray(p)) return p.filter(v => typeof v === 'string' && v.length > 0);
                if (typeof p === 'string') return p.length > 0 ? [p] : [];
            } catch (_) {}
        }
        if (t.startsWith('{') && t.endsWith('}')) {
            const inner = t.slice(1, -1);
            if (!inner) return [];
            return inner
                .match(/("(?:[^"\\]|\\.)*"|[^,]+)/g)
                ?.map(s => s.replace(/^"|"$/g, '').trim())
                .filter(s => s.length > 0) || [];
        }
        return t.length > 0 ? [t] : [];
    }
    return [];
};

// ── Picker option lists ───────────────────────────────────────────────────────
const spiceOptions = [
    { label: 'Select Spice Level...', value: null       },
    { label: 'None',                  value: 'None'     },
    { label: 'Mild',                  value: 'Mild'     },
    { label: 'Medium',                value: 'Medium'   },
    { label: 'Hot',                   value: 'Hot'      },
    { label: 'Volcanic',              value: 'Volcanic' },
];

const dietaryOptions = [
    { label: 'Vegan',       value: 'Vegan'       },
    { label: 'Vegetarian',  value: 'Vegetarian'  },
    { label: 'Gluten-Free', value: 'Gluten-Free' },
    { label: 'Dairy-Free',  value: 'Dairy-Free'  },
];

const toCuisineOptions = (arr) => [
    { label: 'Select Cuisine Type...', value: null },
    ...(arr || []).map(c => ({ label: c, value: c })),
];

const getImageSource = (photoUrl, apiUrl) => {
    if (!photoUrl) return null;
    if (photoUrl.startsWith('data:')) return { uri: photoUrl };
    return { uri: `${apiUrl}${photoUrl}` };
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function ChefMenuItem({
    item: initialItem,
    onItemUpdate,
    isNewDraft = false,
    onCancelNew,
    cuisineTypes = [],
}) {
    const { token } = useAuth();
    const { apiUrl } = getEnvVars();

    const [item,                setItem]                = useState(initialItem);
    const [editing,             setEditing]             = useState(isNewDraft);
    const [uploading,           setUploading]           = useState(false);
    const [availabilityLoading, setAvailabilityLoading] = useState(false);
    const [featureLoading,      setFeatureLoading]      = useState(false);
    const [loading,             setLoading]             = useState(false);

    const [form, setForm] = useState({
        dish_name:    initialItem?.dish_name    || '',
        description:  initialItem?.description  || '',
        photo_url:    initialItem?.photo_url    || '',
        is_available: initialItem?.is_available ?? true,
        is_featured:  initialItem?.is_featured  || false,
        servings:     initialItem?.servings     || 1,
        cuisine_type: initialItem?.cuisine_type || null,
        dietary_info: toArray(initialItem?.dietary_info),
        spice_level:  initialItem?.spice_level  || 'None',
        display_order:initialItem?.display_order|| 0,
        price:        initialItem?.price?.toString() || '0.00',
        prep_time:    initialItem?.prep_time    || 15,
        section:      deriveSectionFromItem(initialItem),
    });

    const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

    const buildPayload = () => ({
        dish_name:     form.dish_name,
        description:   form.description,
        photo_url:     form.photo_url,
        is_available:  form.is_available,
        is_featured:   form.is_featured,
        servings:      form.servings,
        cuisine_type:  form.cuisine_type,
        dietary_info:  form.dietary_info,
        spice_level:   form.spice_level,
        display_order: form.display_order,
        price:         parseFloat(form.price || 0).toFixed(2),
        prep_time:     form.prep_time,
        meal_type:     form.section ? sectionToMealType(form.section) : null,
        category_name: form.section || null,
    });

    const apiCall = async (method, url, body = null) => {
        setLoading(true);
        try {
            const res  = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                ...(body ? { body: JSON.stringify(body) } : {}),
            });
            const data = await res.json();
            setLoading(false);
            return { ok: res.ok && data.success !== false, data };
        } catch (e) { setLoading(false); return { ok: false, data: {} }; }
    };

    const handleSave = async () => {
        if (!form.dish_name.trim()) { Alert.alert('Missing Field', 'Dish Name is required.'); return; }
        if (!form.section)          { Alert.alert('Missing Field', 'Please choose a section — Breakfast, Lunch, Dinner, or Specialties.'); return; }

        const payload = buildPayload();

        if (isNewDraft) {
            const { ok, data } = await apiCall('POST', `${apiUrl}/api/menu/chef/${item.chef_id}`, payload);
            if (!ok) { Alert.alert('Failed', data.error || 'Could not add item.'); return; }

            // Pass full item back so ChefMenuScreen can insert it into the right section immediately
            const newItem = {
                ...payload,
                id:       data.item_id,
                chef_id:  item.chef_id,
                price:    parseFloat(payload.price),
            };
            onItemUpdate(data.item_id, 'POST_SUCCESS', newItem);

        } else {
            const { ok, data } = await apiCall('PUT', `${apiUrl}/api/menu/item/${item.id}`, payload);
            if (!ok) { Alert.alert('Failed', data.error || 'Could not update item.'); return; }

            const updatedItem = { ...item, ...payload, price: parseFloat(payload.price) };
            setItem(updatedItem);
            setEditing(false);

            // Pass full updated item so ChefMenuScreen can move it to the new section instantly
            onItemUpdate(item.id, 'PUT', updatedItem);
        }
    };

    const handleDelete = () => {
        Alert.alert('Confirm Deletion', 'Delete this menu item?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => {
                const { ok, data } = await apiCall('DELETE', `${apiUrl}/api/menu/item/${item.id}`);
                if (!ok) Alert.alert('Failed', data.error || 'Could not delete.');
                else onItemUpdate(item.id, 'DELETE');
            }},
        ]);
    };

    const handleToggleAvail = async () => {
        setAvailabilityLoading(true);
        const newVal = !item.is_available;
        const { ok } = await apiCall('PUT', `${apiUrl}/api/menu/item/${item.id}`, { is_available: newVal });
        if (ok) setItem(prev => ({ ...prev, is_available: newVal }));
        setAvailabilityLoading(false);
    };

    const handleToggleFeatured = async () => {
        setFeatureLoading(true);
        try {
            const getRes  = await fetch(`${apiUrl}/api/menu/chef/${item.chef_id}/featured`, { headers: { Authorization: `Bearer ${token}` } });
            const getData = await getRes.json();
            const ids     = getData.featured_items.map(i => i.id);
            const nowFeat = item.is_featured;
            const newIds  = nowFeat ? ids.filter(id => id !== item.id) : [...new Set([...ids, item.id])];
            const postRes = await fetch(`${apiUrl}/api/menu/chef/${item.chef_id}/featured`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ item_ids: newIds }),
            });
            const postData = await postRes.json();
            if (postRes.ok && postData.success) {
                setItem(prev => ({ ...prev, is_featured: !nowFeat }));
                onItemUpdate?.(item.id, 'FEATURED_UPDATE');
            } else {
                Alert.alert('Failed', postData.error || 'Could not update featured.');
            }
        } catch (e) { Alert.alert('Error', e.message); }
        finally { setFeatureLoading(false); }
    };

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission denied', 'Gallery access required.'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
        if (!result.canceled && result.assets?.length > 0) {
            setUploading(true);
            const localUri = result.assets[0].uri;
            const filename = localUri.split('/').pop();
            const match    = /\.(\w+)$/.exec(filename);
            const type     = match ? `image/${match[1]}` : 'image';
            const formData = new FormData();
            formData.append('photo', { uri: localUri, name: filename, type });
            try {
                const res  = await fetch(`${apiUrl}/api/menu/upload-photo`, { method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: formData });
                const data = await res.json();
                if (data.photo_url) {
                    setItem(prev => ({ ...prev, photo_url: data.photo_url }));
                    set('photo_url', data.photo_url);
                } else {
                    Alert.alert('Upload Failed', data.error || 'Could not upload image.');
                }
            } catch { Alert.alert('Error', 'Could not upload image.'); }
            setUploading(false);
        }
    };

    // ── Loading ───────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <View style={[s.card, { padding: 24, alignItems: 'center' }]}>
                <LoadingIcon icon="spinner" size={64} message="" />
            </View>
        );
    }

    // ── Edit / new-draft form ─────────────────────────────────────────────────
    if (editing) {
        const cuisineOptions = toCuisineOptions(cuisineTypes);
        return (
            <ScrollView style={s.editCard} contentContainerStyle={s.editCardContent}>
                <Text style={s.editTitle}>
                    {isNewDraft ? 'Add New Item' : ('Editing: ' + (item?.dish_name || ''))}
                </Text>

                <TouchableOpacity onPress={pickImage} disabled={uploading} style={s.photoBtn} activeOpacity={0.8}>
                    {item?.photo_url ? (
                        <Image source={getImageSource(item.photo_url, apiUrl)} style={s.photoPreview} resizeMode="cover" />
                    ) : (
                        <View style={s.photoEmpty}>
                            <Octicons name="image" size={28} color={TEXT_SOFT} />
                            <Text style={s.photoEmptyTxt}>Tap to add photo</Text>
                        </View>
                    )}
                    {item?.photo_url ? (
                        <Text style={s.photoChangeTxt}>{uploading ? 'Uploading...' : 'Tap to change photo'}</Text>
                    ) : null}
                </TouchableOpacity>

                <Input label="Dish Name *"       value={form.dish_name}   onChangeText={t => set('dish_name', t)}   placeholder="e.g. Eggs Benedict" />
                <Input label="Description"        value={form.description} onChangeText={t => set('description', t)} placeholder="Short description..." isTextArea multiline maxLength={500} />
                <Input label="Price ($)"          value={form.price}       onChangeText={t => set('price', t)}        keyboardType="decimal-pad" placeholder="0.00" />

                <View style={s.stepperRow}>
                    <Stepper label="Servings"        value={form.servings}  onValueChange={v => set('servings', v)}  min={1} max={20}  step={1} />
                    <Stepper label="Prep Time (min)" value={form.prep_time} onValueChange={v => set('prep_time', v)} min={0} max={300} step={5} />
                </View>

                <View style={s.pickerRow}>
                    <CustomPicker label="Cuisine Type" prompt="Select cuisine..." selectedValue={form.cuisine_type} onValueChange={v => set('cuisine_type', v)} items={cuisineOptions} />
                    <CustomPicker label="Spice Level"  prompt="Select spice..."   selectedValue={form.spice_level}  onValueChange={v => set('spice_level', v)}  items={spiceOptions}  />
                </View>

                <CustomPicker
                    label="Dietary Info"
                    prompt="Select dietary restrictions..."
                    selectedValue={form.dietary_info}
                    onValueChange={v => set('dietary_info', v)}
                    items={dietaryOptions}
                    isMulti={true}
                />

                {/* Section selector */}
                <Text style={s.sectionLabel}>Section *</Text>
                <View style={s.sectionGrid}>
                    {FIXED_SECTIONS.map(sec => {
                        const active = form.section === sec.id;
                        return (
                            <TouchableOpacity
                                key={sec.id}
                                onPress={() => set('section', sec.id)}
                                activeOpacity={0.8}
                                style={[s.sectionBtn, active && { backgroundColor: sec.color, borderColor: sec.textColor }]}
                            >
                                <Text style={[s.sectionBtnLabel, active && { color: sec.textColor }]}>{sec.label}</Text>
                                <Text style={[s.sectionBtnSub,   active && { color: sec.textColor }]}>{sec.subtitle}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <TouchableOpacity style={s.savePrimary}   onPress={handleSave}                                         activeOpacity={0.85}>
                    <Text style={s.savePrimaryTxt}>{isNewDraft ? 'Save Item' : 'Save Changes'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveSecondary} onPress={isNewDraft ? onCancelNew : () => setEditing(false)} activeOpacity={0.85}>
                    <Text style={s.saveSecondaryTxt}>Cancel</Text>
                </TouchableOpacity>
            </ScrollView>
        );
    }

    // ── Read-only card ────────────────────────────────────────────────────────
    const itemSection  = FIXED_SECTIONS.find(sec => sec.id === deriveSectionFromItem(item));
    const dietaryArray = toArray(item?.dietary_info);

    return (
        <View style={s.card}>
            <TouchableOpacity onPress={handleToggleFeatured} disabled={featureLoading} style={[s.featuredBtn, item?.is_featured && s.featuredBtnOn]}>
                <Octicons name="flame" size={14} color={item?.is_featured ? '#fff' : TEXT_SOFT} />
            </TouchableOpacity>

            <Text style={s.dishName}>{item?.dish_name || 'Dish Name'}</Text>

            {itemSection ? (
                <View style={[s.sectionBadge, { backgroundColor: itemSection.color }]}>
                    <Text style={[s.sectionBadgeTxt, { color: itemSection.textColor }]}>
                        {itemSection.label + ' · ' + itemSection.subtitle}
                    </Text>
                </View>
            ) : null}

            <View style={s.dishBody}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                    {item?.description ? <Text style={s.dishDesc}>{item.description}</Text> : null}
                    {item?.servings    ? <Text style={s.dishMeta}>{'Servings: ' + item.servings}</Text> : null}
                    {item?.spice_level ? <Text style={s.dishMeta}>{'Spice: ' + item.spice_level}</Text> : null}
                    {dietaryArray.length > 0 ? (
                        <View style={s.dietaryRow}>
                            {dietaryArray.map(d => (
                                <View key={d} style={s.dietaryChip}>
                                    <Text style={s.dietaryChipTxt}>{d}</Text>
                                </View>
                            ))}
                        </View>
                    ) : null}
                </View>
                <View style={{ width: 130 }}>
                    {item?.photo_url ? (
                        <Image source={getImageSource(item.photo_url, apiUrl)} style={s.dishImage} resizeMode="cover" />
                    ) : (
                        <View style={[s.dishImage, s.dishImageEmpty]}>
                            <Text style={s.dishImageEmptyTxt}>NO IMAGE</Text>
                        </View>
                    )}
                </View>
            </View>

            <View style={s.dishFooter}>
                {item?.prep_time != null ? <Text style={s.dishFooterMeta}>{'Prep: ' + item.prep_time + ' min'}</Text> : null}
                {item?.price     != null ? <Text style={s.dishPrice}>{'$' + Number(item.price).toFixed(2)}</Text> : null}
            </View>

            <TouchableOpacity style={[s.availBtn, item?.is_available ? s.availOff : s.availOn]} onPress={handleToggleAvail} disabled={availabilityLoading} activeOpacity={0.85}>
                <Text style={[s.availTxt, !item?.is_available && { color: GREEN }]}>
                    {availabilityLoading ? 'Updating...' : item?.is_available ? 'Make Unavailable' : 'Make Available'}
                </Text>
            </TouchableOpacity>

            <View style={s.editDeleteRow}>
                <TouchableOpacity style={s.editBtn}   onPress={() => setEditing(true)} activeOpacity={0.85}>
                    <Text style={s.editBtnTxt}>Edit item</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.deleteBtn} onPress={handleDelete}           activeOpacity={0.85}>
                    <Octicons name="trash" size={16} color="#ef4444" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    card:            { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 12, overflow: 'hidden', padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
    editCard:        { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 12 },
    editCardContent: { padding: 16, paddingBottom: 24 },
    editTitle:       { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 16 },
    photoBtn:        { alignItems: 'center', marginBottom: 16 },
    photoPreview:    { width: 140, height: 140, borderRadius: 12 },
    photoEmpty:      { width: 140, height: 140, borderRadius: 12, backgroundColor: GREEN_LIGHT, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: BORDER },
    photoEmptyTxt:   { fontSize: 12, color: TEXT_SOFT, marginTop: 6 },
    photoChangeTxt:  { fontSize: 12, color: TEXT_MID, marginTop: 6, textDecorationLine: 'underline' },
    stepperRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, gap: 12 },
    pickerRow:       { flexDirection: 'row', justifyContent: 'space-between' },
    sectionLabel:    { fontSize: 12, fontWeight: '700', color: TEXT_MID, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
    sectionGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    sectionBtn:      { width: '47%', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, backgroundColor: '#f8faf8', alignItems: 'center' },
    sectionBtnLabel: { fontSize: 13, fontWeight: '700', color: TEXT },
    sectionBtnSub:   { fontSize: 11, color: TEXT_SOFT, marginTop: 2 },
    savePrimary:     { backgroundColor: GREEN, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
    savePrimaryTxt:  { color: '#fff', fontWeight: '700', fontSize: 15 },
    saveSecondary:   { paddingVertical: 13, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: BORDER, backgroundColor: '#fff' },
    saveSecondaryTxt:{ color: TEXT_MID, fontWeight: '600', fontSize: 14 },
    featuredBtn:     { position: 'absolute', top: 10, right: 10, zIndex: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: '#f0f5f0', alignItems: 'center', justifyContent: 'center' },
    featuredBtnOn:   { backgroundColor: '#f97316' },
    sectionBadge:    { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginBottom: 8 },
    sectionBadgeTxt: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
    dishName:        { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center', paddingBottom: 10, paddingRight: 32, borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 10 },
    dishBody:        { flexDirection: 'row', marginBottom: 10 },
    dishDesc:        { fontSize: 13, color: TEXT_MID, marginBottom: 4, lineHeight: 18 },
    dishMeta:        { fontSize: 12, color: TEXT_SOFT, marginBottom: 2 },
    dietaryRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
    dietaryChip:     { backgroundColor: GREEN_LIGHT, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
    dietaryChipTxt:  { fontSize: 11, fontWeight: '600', color: GREEN },
    dishImage:       { width: 130, height: 120, borderRadius: 10 },
    dishImageEmpty:  { backgroundColor: GREEN_LIGHT, alignItems: 'center', justifyContent: 'center' },
    dishImageEmptyTxt:{ fontSize: 12, color: GREEN, fontWeight: '600' },
    dishFooter:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, marginBottom: 10, borderTopWidth: 1, borderTopColor: BORDER },
    dishFooterMeta:  { fontSize: 13, color: TEXT_SOFT },
    dishPrice:       { fontSize: 18, fontWeight: '800', color: GREEN },
    availBtn:        { paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, marginBottom: 8 },
    availOff:        { borderColor: BORDER, backgroundColor: '#fff' },
    availOn:         { borderColor: GREEN_LIGHT, backgroundColor: GREEN_LIGHT },
    availTxt:        { fontSize: 14, fontWeight: '600', color: TEXT_MID },
    editDeleteRow:   { flexDirection: 'row', gap: 8 },
    editBtn:         { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: GREEN, alignItems: 'center' },
    editBtnTxt:      { color: '#fff', fontWeight: '700', fontSize: 14 },
    deleteBtn:       { width: 42, height: 42, borderRadius: 10, backgroundColor: '#fff0f0', borderWidth: 1, borderColor: '#fecaca', alignItems: 'center', justifyContent: 'center' },
});