import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Octicons from '@expo/vector-icons/Octicons';
import Button from './Button';

const GREEN = '#2d6a4f';
const GREEN_LIGHT = '#d8f3dc';
const BORDER = '#e2ece2';

export default function Card({
    title,
    headerIcon,
    isCollapsible = false,
    isScrollable = false,
    scrollDirection = 'vertical',
    children,
    footerButtonProps = null,
    startExpanded = false,
    customClasses = '',
    customCard = '',
    customHeader = '',
    customHeaderText = ''
}) {
    const [isExpanded, setIsExpanded] = useState(isCollapsible ? startExpanded : true);
    const ContentWrapper = isScrollable ? ScrollView : View;
    const scrollProps = isScrollable
        ? {
            horizontal: scrollDirection === 'horizontal',
            showsHorizontalScrollIndicator: scrollDirection === 'horizontal',
            showsVerticalScrollIndicator: scrollDirection === 'vertical',
            contentContainerStyle: scrollDirection === 'horizontal' ? { paddingHorizontal: 4 } : {},
        }
        : {};

    return (
        <View style={s.card}>
            {title && (
                <TouchableOpacity
                    style={s.header}
                    onPress={() => isCollapsible && setIsExpanded(!isExpanded)}
                    activeOpacity={isCollapsible ? 0.7 : 1}
                >
                    <View style={s.headerLeft}>
                        {headerIcon && (
                            <Octicons
                                name={headerIcon}
                                size={18}
                                color={GREEN}
                                style={{ marginRight: 8 }}
                            />
                        )}
                        <Text style={s.headerText}>{title}</Text>
                    </View>
                    {isCollapsible && (
                        <Octicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={18}
                            color="#8aab8a"
                        />
                    )}
                </TouchableOpacity>
            )}
            {isExpanded && (
                <ContentWrapper style={s.content} {...scrollProps}>
                    {children}
                </ContentWrapper>
            )}
            {footerButtonProps && (
                <View style={s.footer}>
                    <Button
                        title={footerButtonProps.title}
                        style={footerButtonProps.style || 'primary'}
                        onPress={footerButtonProps.onPress}
                        href={footerButtonProps.href}
                        icon={footerButtonProps.icon}
                        customClasses="w-full"
                    />
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BORDER,
        marginBottom: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: BORDER,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center' },
    headerText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1a2e1a',
        letterSpacing: -0.2,
    },
    content: { padding: 12 },
    footer: { padding: 16, paddingTop: 0 },
});