import LottieView from 'lottie-react-native';
import { View, Text, StyleSheet } from 'react-native';

const GREEN = '#2d6a4f';

const lottieSrc = {
    'pan': require('../assets/lotties/panLoading.json'),
    'spinner': require('../assets/lotties/spinnerLoading.json'),
    'flame': require('../assets/lotties/flameLoading.json'),
    'food': require('../assets/lotties/foodLoading.json'),
};

export default function LoadingIcon({
    message = "Just a moment...",
    icon = "pan",
    size = 192
}) {
    return (
        <View style={s.container}>
            <LottieView
                source={lottieSrc[icon]}
                style={{ width: size, height: size }}
                autoPlay
                loop
            />
            {message ? (
                <Text style={s.message}>{message}</Text>
            ) : null}
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        flex: 1, justifyContent: 'center', alignItems: 'center',
        backgroundColor: '#fefce8',
    },
    message: {
        fontSize: 16, fontWeight: '600',
        color: GREEN, marginTop: 16,
    },
});