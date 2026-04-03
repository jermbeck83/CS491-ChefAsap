import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import Octicons from '@expo/vector-icons/Octicons';

export default function Input({
    label, // input label
    error, // error message
    containerClasses = "mb-1", // optional container classes
    isTextArea = false, // allows for multi-line input
    secureTextEntry, //allows for password hiding
    disabled = false, // disables input
    embedded = false, // no border/bg — use inside a pre-styled row (e.g. search header)
    ...props // standard TextInput props
}) {
    const isPasswordField = secureTextEntry === true;
    const [isPasswordVisible, setIsPasswordVisible] = useState(isPasswordField);
    const togglePasswordVisibility = () => {
        setIsPasswordVisible(prev => !prev);
    };

    const baseClasses = "border border-primary-200 bg-white dark:bg-black rounded-full py-3 px-4 text-base text-primary-500 focus:border-primary-300 shadow-sm shadow-primary-500 dark:border-dark-200 dark:focus:border-dark-300 dark:text-dark-500";
    const embeddedClasses = "border-0 bg-transparent py-2.5 px-2 text-base text-stone-800 shadow-none rounded-none dark:text-stone-100";
    const shellClasses = embedded ? embeddedClasses : baseClasses;
    const finalInputClasses = isTextArea
        ? `${shellClasses.replace('rounded-full', 'rounded-lg')} h-24 text-top`
        : embedded
            ? `${shellClasses} min-h-[24px]`
            : `${shellClasses} rounded-full`;

    const finalSecureTextEntry = isPasswordField && isPasswordVisible;

    const eyeLocation = label ? 'top-[37px]' : 'top-[4px]';

    return (
        <View className={containerClasses}>
            {label && (
                <Text className="text-sm font-semibold mb-1 mt-2 text-primary-400 dark:text-dark-400">
                    {label}
                </Text>
            )}

            <TextInput
                className={finalInputClasses}
                placeholderTextColor="#6b7280" // base-200
                style={isTextArea ? { textAlignVertical: 'top' } : {}}
                secureTextEntry={finalSecureTextEntry}
                editable={!disabled}
                underlineColorAndroid={embedded ? 'transparent' : undefined}
                {...props}
            />

            {isPasswordField && (
                <TouchableOpacity
                    onPress={togglePasswordVisibility}
                    className={`absolute right-0 p-3 ${eyeLocation}`}
                >
                    <Octicons
                        name={isPasswordVisible ? 'eye' : 'eye-closed'}
                        size={20}
                        color="#6b7280" // base-200
                    />
                </TouchableOpacity>
            )}

            {error ? (
                <Text className="text-red-500 text-xs mt-1 ml-1">{error}</Text>
            ) : null}
        </View>
    );
}