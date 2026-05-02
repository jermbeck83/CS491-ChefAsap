import { View, Text, Image, StyleSheet } from "react-native";
import getEnvVars from "../../config";

const GREEN = '#2d6a4f';
const GREEN_LIGHT = '#d8f3dc';

export default function ProfilePicture({
    photoUrl = '',
    firstName = '',
    lastName = '',
    size = 32,
    customClasses = '',
}) {
    const { apiUrl } = getEnvVars();
    const diameter = size * 4;
    const borderWidth = Math.max(2, size / 8);
    const fontSize = size * 1.5;
    const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();

    // Handle base64, full URLs, and relative paths
    const getImageUri = () => {
        if (!photoUrl) return null;
        if (photoUrl.startsWith('data:')) return photoUrl;          // base64
        if (photoUrl.startsWith('http')) return photoUrl;           // full URL
        if (photoUrl.startsWith('/static/')) return null;           // old broken path
        return `${apiUrl}${photoUrl}`;                              // relative path
    };

    const imageUri = getImageUri();

    return (
        <View style={{ alignItems: 'center' }}>
            {imageUri ? (
                <Image
                    source={{ uri: imageUri }}
                    style={{
                        width: diameter,
                        height: diameter,
                        borderRadius: diameter / 2,
                        borderWidth,
                        borderColor: GREEN_LIGHT,
                    }}
                    resizeMode="cover"
                    onError={() => {}}
                />
            ) : (
                <View
                    style={{
                        width: diameter,
                        height: diameter,
                        borderRadius: diameter / 2,
                        borderWidth,
                        borderColor: GREEN,
                        backgroundColor: GREEN_LIGHT,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <Text style={{ fontSize, fontWeight: '700', color: GREEN, letterSpacing: 1 }}>
                        {initials}
                    </Text>
                </View>
            )}
        </View>
    );
}