import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import Octicons from '@expo/vector-icons/Octicons';

const GREEN    = '#2d6a4f';
const BORDER   = '#e2ece2';
const TEXT     = '#1a2e1a';
const TEXT_MID = '#4a7c59';
const TEXT_SOFT= '#8aab8a';

export default function Input({
    label,
    error,
    isTextArea = false,
    secureTextEntry,
    disabled = false,
    embedded = false,
    style,
    // legacy props — accepted but ignored so callers don't need changes
    containerClasses,
    labelStyle,
    ...props
}) {
    const isPasswordField = secureTextEntry === true;
    const [passwordHidden, setPasswordHidden] = useState(true);

    return (
        <View style={s.container}>
            {label ? (
                <Text style={s.label}>{label}</Text>
            ) : null}

            <View style={s.wrap}>
                <TextInput
                    style={[
                        s.input,
                        isTextArea && s.textArea,
                        embedded   && s.embedded,
                        disabled   && s.disabled,
                        error      && s.inputError,
                        isPasswordField && { paddingRight: 44 },
                        style,
                    ]}
                    placeholderTextColor={TEXT_SOFT}
                    secureTextEntry={isPasswordField && passwordHidden}
                    editable={!disabled}
                    multiline={isTextArea}
                    textAlignVertical={isTextArea ? 'top' : 'center'}
                    underlineColorAndroid="transparent"
                    {...props}
                />

                {isPasswordField ? (
                    <TouchableOpacity
                        onPress={() => setPasswordHidden(v => !v)}
                        style={s.eyeBtn}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    >
                        <Octicons
                            name={passwordHidden ? 'eye' : 'eye-closed'}
                            size={18}
                            color={TEXT_SOFT}
                        />
                    </TouchableOpacity>
                ) : null}
            </View>

            {error ? (
                <Text style={s.errorText}>{error}</Text>
            ) : null}
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        marginBottom: 12,
    },
    label: {
        fontSize: 12,
        fontWeight: '700',
        color: TEXT_MID,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 6,
        marginTop: 4,
    },
    wrap: {
        position: 'relative',
        justifyContent: 'center',
    },
    input: {
        backgroundColor: '#fff',
        borderWidth: 1.5,
        borderColor: BORDER,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        fontWeight: '500',
        color: TEXT,
        minHeight: 46,
    },
    textArea: {
        minHeight: 100,
        paddingTop: 12,
        borderRadius: 14,
    },
    embedded: {
        borderWidth: 0,
        backgroundColor: 'transparent',
        paddingHorizontal: 4,
    },
    disabled: {
        backgroundColor: '#f3f4f6',
        color: TEXT_SOFT,
    },
    inputError: {
        borderColor: '#ef4444',
    },
    eyeBtn: {
        position: 'absolute',
        right: 14,
        padding: 4,
    },
    errorText: {
        fontSize: 12,
        color: '#ef4444',
        marginTop: 4,
        marginLeft: 4,
    },
});