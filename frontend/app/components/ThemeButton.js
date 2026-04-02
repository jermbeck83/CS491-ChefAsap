import React from 'react';
import { useTheme } from '../providers/ThemeProvider';
import Button from './Button';

export default function ThemeButton() {
    const { manualTheme, setManualTheme } = useTheme();

    const getNextTheme = () => (manualTheme === 'dark' ? 'light' : 'dark');
    const getIcon = (theme) => (theme === 'dark' ? 'moon' : 'sun');

    const iconName = getIcon(manualTheme);

    return (
        <Button
            icon={iconName}
            onPress={() => setManualTheme(getNextTheme())}
            customClasses="absolute -top-[62px] right-[40px] z-10 p-3 rounded-full pl-3"
            style='accent'
        />
    );
}