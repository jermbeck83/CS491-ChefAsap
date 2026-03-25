import React, { useState, useEffect } from 'react';
import { View, Text, Alert, ScrollView, Image, TouchableOpacity } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
import Octicons from '@expo/vector-icons/Octicons';

import getEnvVars from "../../config";
import { useAuth } from "../context/AuthContext";

import LoadingIcon from './LoadingIcon';
import Button from './Button';
import TagsBox from './TagsBox';
import Input from './Input';
import Stepper from './Stepper';
import CustomPicker from './Picker';

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

const convertToPickerOptions = (optionsArray, promptLabel = "Select Option...") => {
    const options = [{ label: promptLabel, value: null }];
    if (optionsArray && Array.isArray(optionsArray)) {
        optionsArray.forEach(item => {
            options.push({ label: item, value: item });
        });
    }
    return options;
};

// Helper: determine if a photo_url is base64 or a remote path
const getImageSource = (photoUrl, apiUrl) => {
    if (!photoUrl) return null;
    // Base64 data URIs are standalone — don't prepend apiUrl
    if (photoUrl.startsWith('data:')) {
        return { uri: photoUrl };
    }
    // Legacy filesystem path — prepend apiUrl
    return { uri: `${apiUrl}${photoUrl}` };
};

export default function ChefMenuItem({
    item: initialItem,
    onItemUpdate,
    isNewDraft = false,
    onCancelNew,
    cuisineTypes = [],
    categories = [],
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
    const [error, setError] = useState(null);

    const [form, setForm] = useState({
        dish_name: initialItem?.dish_name || '',
        description: initialItem?.description || '',
        photo_url: initialItem?.photo_url || '',
        is_available: initialItem?.is_available || true,
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

    const categoryList = [
        ...categories.map(c => ({ label: c.category_name, value: c.id })),
        { label: 'Other', value: null }
    ];

    const sendMenuItemRequest = async (method, body = null) => {
        if (!availabilityLoading) setLoading(true);
        setError(null);
        try {
            const url = `${apiUrl}/api/menu/item/${item.id}`;
            const options = {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            };
            if (method === 'PUT' && body) {
                options.body = JSON.stringify(body);
            }
            const response = await fetch(url, options);
            const data = await response.json();
            setLoading(false);
            if (!response.ok || !data.success) {
                const errorMessage = data.error || `Failed to ${method} item.`;
                setError(errorMessage);
                Alert.alert("Operation Failed", errorMessage);
                return false;
            }
            if (onItemUpdate) onItemUpdate(item.id, method);
            return true;
        } catch (e) {
            setLoading(false);
            setError(e.message);
            return false;
        }
    };

    const handleChange = (name, value) => {
        if (name === 'category_id') {
            if (value === form.category_id) return;
            setCategoryUpdated(true);
        }
        setForm(prevForm => ({ ...prevForm, [name]: value }));
    };

    const addMenuItemRequest = async (body) => {
        setLoading(true);
        setError(null);
        try {
            const url = `${apiUrl}/api/menu/chef/${item.chef_id}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            });
            const data = await response.json();
            setLoading(false);
            if (!response.ok || !data.success) {
                Alert.alert("Operation Failed", data.error || "Failed to add new item.");
                return false;
            }
            onItemUpdate(data.item_id, 'POST_SUCCESS');
            return true;
        } catch (e) {
            setLoading(false);
            Alert.alert("Network Error", "Could not connect to the server.");
            return false;
        }
    };

    const handleUpdateItem = async () => {
        const updatePayload = {
            ...form,
            price: parseFloat(form.price).toFixed(2)
        };
        if (!updatePayload.dish_name) {
            Alert.alert("Missing Field", "Dish Name is required.");
            return;
        }
        let success = false;
        if (isNewDraft) {
            success = await addMenuItemRequest(updatePayload);
        } else {
            success = await sendMenuItemRequest('PUT', updatePayload);
        }
        if (success && !isNewDraft) {
            setItem(prev => ({
                ...prev,
                ...updatePayload,
                price: parseFloat(updatePayload.price)
            }));
            setEditing(false);
            if (categoryUpdated && onItemUpdate) {
                onItemUpdate(item.id, 'CATEGORY_UPDATE');
                setCategoryUpdated(false);
            }
        }
    };

    const handleToggleAvailability = async () => {
        setAvailabilityLoading(true);
        const newAvailability = !item.is_available;
        const success = await sendMenuItemRequest('PUT', { is_available: newAvailability });
        if (success) {
            setItem(prev => ({ ...prev, is_available: newAvailability }));
        }
        setAvailabilityLoading(false);
    };

    const handleToggleFeatured = async () => {
        setFeatureLoading(true);
        setError(null);
        try {
            const getUrl = `${apiUrl}/api/menu/chef/${item.chef_id}/featured`;
            const getResponse = await fetch(getUrl, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!getResponse.ok) throw new Error("Could not fetch current featured items.");
            const getData = await getResponse.json();
            let featuredIds = getData.featured_items.map(i => i.id);
            const isCurrentlyFeatured = item.is_featured;
            let newFeaturedIds = [...featuredIds];
            if (isCurrentlyFeatured) {
                newFeaturedIds = newFeaturedIds.filter(id => id !== item.id);
            } else {
                if (!newFeaturedIds.includes(item.id)) {
                    newFeaturedIds.push(item.id);
                }
            }
            const postUrl = `${apiUrl}/api/menu/chef/${item.chef_id}/featured`;
            const postResponse = await fetch(postUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ item_ids: newFeaturedIds }),
            });
            const postData = await postResponse.json();
            setFeatureLoading(false);
            if (!postResponse.ok || !postData.success) {
                const errorMessage = postData.error || "Failed to set featured dishes.";
                setError(errorMessage);
                Alert.alert("Operation Failed", errorMessage);
                return;
            }
            setItem(prev => ({ ...prev, is_featured: !isCurrentlyFeatured }));
            if (onItemUpdate) onItemUpdate(item.id, 'FEATURED_UPDATE');
        } catch (e) {
            setLoading(false);
            setError(e.message);
            Alert.alert("Error", e.message);
        }
    };

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            alert('Permission to access gallery was denied');
            return;
        }

        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7, // Reduced quality to keep base64 size manageable
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            setUploading(true);
            const localUri = result.assets[0].uri;
            const filename = localUri.split('/').pop();
            const match = /\.(\w+)$/.exec(filename);
            const type = match ? `image/${match[1]}` : `image`;

            const formData = new FormData();
            formData.append('photo', {
                uri: localUri,
                name: filename,
                type,
            });

            try {
                // Always use /upload-photo endpoint — works for both new and existing items
                // The base64 URL is then saved with the item data
                const uploadUrl = `${apiUrl}/api/menu/upload-photo`;
                const response = await fetch(uploadUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                    body: formData,
                });

                const data = await response.json();

                if (data.photo_url) {
                    // Update both item state and form so it saves with the item
                    setItem({ ...item, photo_url: data.photo_url });
                    setForm({ ...form, photo_url: data.photo_url });
                } else {
                    Alert.alert('Upload Failed', data.error || 'Failed to upload image');
                }
            } catch (error) {
                console.error('Error uploading image:', error);
                Alert.alert('Error', 'Failed to upload image. Please try again.');
            }
            setUploading(false);
        }
    };

    const handleDeleteItem = async () => {
        Alert.alert(
            "Confirm Deletion",
            "Are you sure you want to delete this menu item?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => await sendMenuItemRequest('DELETE')
                },
            ]
        );
    };

    if (loading) {
        return (
            <View className="bg-base-100 dark:bg-base-dark-100 flex p-4 pb-2 rounded-xl shadow-sm shadow-primary-500 mb-4 w-full" key={item?.id}>
                <LoadingIcon icon='spinner' size={128} message='' />
            </View>
        );
    }

    if (editing) {
        return (
            <ScrollView className="bg-base-100 dark:bg-base-dark-100 p-4 rounded-xl shadow-sm shadow-primary-500 mb-4 w-full">
                <Text className="text-xl font-bold mb-4 text-center text-primary-500 dark:text-dark-500">
                    {isNewDraft ? "Adding Item" : `Editing: ${item?.dish_name}`}
                </Text>

                <Input
                    label="Dish Name*"
                    value={form.dish_name}
                    onChangeText={(text) => handleChange('dish_name', text)}
                />

                <TouchableOpacity className="items-center pt-2" onPress={pickImage} disabled={uploading || !editing}>
                    {item?.photo_url ? (
                        <Image
                            source={getImageSource(item.photo_url, apiUrl)}
                            className={"h-[150px] w-[150px] rounded-xl shadow-sm shadow-primary-500 dark:shadow-dark-500 border border-primary-400 dark:border-dark-400"}
                        />
                    ) : (
                        <View className="bg-white h-[150px] w-[150px] justify-center rounded-xl shadow-sm shadow-primary-500 dark:shadow-dark-500 border border-primary-100 dark:border-dark-200">
                            <Text className="text-lg text-center text-primary-400 dark:text-dark-400">NO IMAGE</Text>
                        </View>
                    )}
                    {editing &&
                        <Text className="text-base text-primary-400 underline pt-2 dark:text-dark-400" style={{ textAlign: "left" }}>
                            {uploading ? "Uploading..." : "Tap to change image"}
                        </Text>
                    }
                </TouchableOpacity>

                <Input
                    label="Description"
                    isTextArea={true}
                    value={form.description}
                    onChangeText={(text) => handleChange('description', text)}
                    containerClasses='mb-3'
                    maxLength={500}
                    multiline={true}
                />

                <Input
                    label="Price ($)"
                    value={form.price}
                    onChangeText={(text) => handleChange('price', text)}
                    keyboardType="numeric"
                    containerClasses='mb-3'
                />

                <View className="flex-row justify-between mb-4">
                    <Stepper
                        label="Servings"
                        value={form.servings}
                        onValueChange={(val) => handleChange('servings', val)}
                        min={1}
                        max={10}
                        step={1}
                        size={10}
                    />
                    <Stepper
                        label="Prep Time (min)"
                        value={form.prep_time}
                        onValueChange={(val) => handleChange('prep_time', val)}
                        min={0}
                        max={120}
                        step={5}
                        size={10}
                    />
                </View>

                <View className="flex-row flex-wrap justify-between">
                    <CustomPicker
                        label="Cuisine Type"
                        prompt="Select Cuisine..."
                        selectedValue={form.cuisine_type}
                        onValueChange={(val) => handleChange('cuisine_type', val)}
                        items={cuisineOptions}
                    />
                    <CustomPicker
                        label="Spice Level"
                        prompt="Select Spice..."
                        selectedValue={form.spice_level}
                        onValueChange={(val) => handleChange('spice_level', val)}
                        items={spiceOptions}
                    />
                </View>
                <View className="flex-row flex-wrap justify-between mb-2">
                    <CustomPicker
                        label="Dietary Info"
                        prompt="Select Dietary..."
                        selectedValue={form.dietary_info}
                        onValueChange={(val) => handleChange('dietary_info', val)}
                        items={dietaryOptions}
                    />
                </View>
                <CustomPicker
                    label="Category"
                    prompt="Select Category..."
                    selectedValue={form.category_id}
                    onValueChange={(val) => handleChange('category_id', val)}
                    items={categoryList}
                    customClass='mb-2'
                />
                <Button
                    title={isNewDraft ? "Save Item" : "Save Changes"}
                    onPress={handleUpdateItem}
                    style='primary'
                />
                <Button
                    title="Cancel"
                    onPress={isNewDraft ? onCancelNew : () => setEditing(false)}
                    style='secondary'
                />
            </ScrollView>
        );
    }

    return (
        <View className="bg-base-100 dark:bg-base-dark-100 flex p-4 pb-2 rounded-xl shadow-sm shadow-primary-500 mb-4 w-full" key={item?.id}>
            <Text className="text-lg font-medium mb-2 pb-2 text-center text-justified text-primary-400 dark:text-dark-400 w-full border-b border-primary-400 dark:border-dark-400">
                {item?.dish_name || 'Dish Name'}
            </Text>
            <View className="flex-row border-b border-primary-400 dark:border-dark-400 pb-2">
                <View className="flex w-1/2 justify-between pr-2">
                    <TagsBox words={[].concat(item?.cuisine_type, item?.dietary_info)} theme='light' />
                    <Text className="text-primary-400 text-md pt-1 mb-1 text-center text-justified dark:text-dark-400">
                        {item?.description || 'No description available'}
                    </Text>
                    {item?.servings && (
                        <Text className="text-primary-400 text-xs pt-1 text-center text-justified dark:text-dark-400">
                            Servings: {item.servings}
                        </Text>
                    )}
                    {item?.spice_level && (
                        <Text className="text-primary-400 text-xs mb-1 text-center text-justified dark:text-dark-400">
                            Spice Level: {item.spice_level}
                        </Text>
                    )}
                </View>
                <View className="flex w-1/2 justify-center">
                    {item?.photo_url ? (
                        <Image
                            source={getImageSource(item.photo_url, apiUrl)}
                            className={"h-[150px] w-[150px] rounded-xl shadow-sm shadow-primary-500 dark:shadow-dark-500 border border-primary-400 dark:border-dark-400"}
                        />
                    ) : (
                        <View className="bg-white h-[150px] justify-center rounded-xl shadow-sm shadow-primary-500 dark:shadow-dark-500 border border-primary-400 dark:border-dark-400">
                            <Text className="text-lg text-center text-primary-400 dark:text-dark-400">NO IMAGE</Text>
                        </View>
                    )}
                </View>
            </View>

            <View className="flex-row justify-between items-center p-2">
                {item?.prep_time && (
                    <Text className="text-primary-400 text-nd font-medium text-center text-justified dark:text-dark-400">
                        Prep time: {item.prep_time} min
                    </Text>
                )}
                {item?.price && (
                    <Text className="text-primary-400 text-xl font-medium text-center dark:text-dark-400 pr-2">
                        ${item.price.toFixed(2)}
                    </Text>
                )}
            </View>

            <Button
                onPress={handleToggleFeatured}
                icon={featureLoading ? 'sync' : 'flame'}
                style={item?.is_featured ? 'primary' : 'secondary'}
                customClasses="absolute top-1 right-2 z-10 p-3 rounded-full pl-3"
                disabled={featureLoading}
            />
            <Button
                title={item?.is_available ? "Make Unavailable" : "Make Available"}
                onPress={handleToggleAvailability}
                style='secondary'
                customClasses="h-12 pb-1 pt-1"
                customTextClasses='text-md'
                disabled={availabilityLoading}
            />
            <View className="flex-row justify-center">
                <Button
                    title={"Edit item"}
                    onPress={() => setEditing(true)}
                    customClasses="w-[85%] mr-1 h-12 pb-1 pt-1"
                    customTextClasses='text-md'
                />
                <Button
                    icon='trash'
                    onPress={handleDeleteItem}
                    customClasses="rounded-full h-12 w-12"
                />
            </View>
        </View>
    );
}