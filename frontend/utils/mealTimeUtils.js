/**
 * mealTimeUtils.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Central source of truth for meal-type time windows.
 *
 * Import this in:
 *   • Customer booking / checkout screen  → validate the chosen time
 *   • Kitchen Assistant screen            → remove the conflict flag
 *   • Any time-picker component           → grey out invalid hours
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Time windows for each meal type.
 * startHour is inclusive, endHour is exclusive (same as JavaScript Date logic).
 *   Breakfast  6:00 AM – 10:59 AM
 *   Lunch     11:00 AM –  2:59 PM
 *   Dinner     5:00 PM – 10:59 PM
 *   Any        no restriction
 */
export const MEAL_TIME_WINDOWS = {
    Breakfast: { startHour: 6,  endHour: 11, label: '6 AM – 11 AM'  },
    Lunch:     { startHour: 11, endHour: 15, label: '11 AM – 3 PM'  },
    Dinner:    { startHour: 17, endHour: 23, label: '5 PM – 11 PM'  },
    Any:       { startHour: 0,  endHour: 24, label: 'Any time'      },
};

/**
 * Given a booking time (Date object or HH:MM string) and a meal_type string,
 * returns { valid: boolean, message: string }.
 *
 * Usage in your checkout screen:
 *
 *   const { valid, message } = validateBookingTime(selectedTime, item.meal_type);
 *   if (!valid) { Alert.alert('Invalid Time', message); return; }
 */
export function validateBookingTime(time, mealType) {
    if (!mealType || mealType === 'Any' || !MEAL_TIME_WINDOWS[mealType]) {
        return { valid: true, message: '' };
    }

    const { startHour, endHour, label } = MEAL_TIME_WINDOWS[mealType];

    let hour;
    if (time instanceof Date) {
        hour = time.getHours();
    } else if (typeof time === 'string') {
        // Accepts "HH:MM" or "HH:MM:SS"
        hour = parseInt(time.split(':')[0], 10);
    } else {
        return { valid: true, message: '' }; // can't validate, allow through
    }

    if (hour >= startHour && hour < endHour) {
        return { valid: true, message: '' };
    }

    return {
        valid: false,
        message: `${mealType} items can only be booked between ${label}. Please select a different time.`,
    };
}

/**
 * Given an array of cart items (each with a meal_type field) and a proposed
 * booking time, returns all conflict objects so the UI can warn the customer.
 *
 * Usage:
 *   const conflicts = getCartConflicts(cartItems, selectedTime);
 *   // conflicts = [{ item, mealType, allowedLabel }, ...]
 */
export function getCartConflicts(cartItems, bookingTime) {
    if (!bookingTime || !Array.isArray(cartItems)) return [];

    return cartItems
        .filter(item => item.meal_type && item.meal_type !== 'Any')
        .reduce((acc, item) => {
            const { valid } = validateBookingTime(bookingTime, item.meal_type);
            if (!valid) {
                const win = MEAL_TIME_WINDOWS[item.meal_type];
                acc.push({
                    item,
                    mealType: item.meal_type,
                    allowedLabel: win ? win.label : '',
                });
            }
            return acc;
        }, []);
}

/**
 * For a time-picker: given a meal_type, returns an array of allowed hours (0-23).
 * Use this to disable/grey-out hours that don't fit the selected item.
 *
 * Usage:
 *   const allowed = getAllowedHours(item.meal_type);
 *   // allowed = [6, 7, 8, 9, 10] for Breakfast
 */
export function getAllowedHours(mealType) {
    if (!mealType || mealType === 'Any' || !MEAL_TIME_WINDOWS[mealType]) {
        return Array.from({ length: 24 }, (_, i) => i); // all hours
    }
    const { startHour, endHour } = MEAL_TIME_WINDOWS[mealType];
    const hours = [];
    for (let h = startHour; h < endHour; h++) hours.push(h);
    return hours;
}

/**
 * Derive the expected meal type for a given hour, used by Kitchen Assistant
 * to auto-resolve conflicts (no more "Menu Conflict Flag" when the booking
 * time actually matches the items' meal_type).
 *
 * Returns: 'Breakfast' | 'Lunch' | 'Dinner' | 'Any'
 */
export function getMealTypeForHour(hour) {
    if (hour >= 6  && hour < 11) return 'Breakfast';
    if (hour >= 11 && hour < 15) return 'Lunch';
    if (hour >= 17 && hour < 23) return 'Dinner';
    return 'Any';
}

/**
 * Full conflict check for Kitchen Assistant.
 * Pass the booking object and the menu items array.
 *
 * Returns an array of conflict strings (empty = no conflicts).
 *
 * Usage in KitchenAssistantScreen:
 *   const flags = getKitchenConflicts(booking, menuItems);
 *   // flags = [] means no conflict badge needed
 */
export function getKitchenConflicts(booking, menuItems) {
    if (!booking || !menuItems?.length) return [];

    const bookingHour = (() => {
        if (!booking.booking_time) return null;
        return parseInt(String(booking.booking_time).split(':')[0], 10);
    })();

    if (bookingHour === null) return [];

    const expectedMealType = getMealTypeForHour(bookingHour);
    const conflicts = [];

    menuItems.forEach(item => {
        if (!item.meal_type || item.meal_type === 'Any') return;
        if (item.meal_type !== expectedMealType) {
            const win = MEAL_TIME_WINDOWS[item.meal_type];
            conflicts.push(
                `"${item.dish_name}" is tagged as ${item.meal_type} (${win?.label ?? ''}), ` +
                `but the booking is at ${bookingHour}:00 (${expectedMealType} time).`
            );
        }
    });

    return conflicts;
}