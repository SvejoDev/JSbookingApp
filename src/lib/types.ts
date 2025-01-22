export interface BookingLength {
    length: string;
    overnight: boolean;
    return_day_offset: number;
}

export interface OpeningPeriods {
    periods: Array<{
        start_date: string;
        end_date: string;
    }>;
    specificDates: Array<{
        date: string;
        timeSlots?: string[];
    }>;
    defaultOpenTime: string;
    defaultCloseTime: string;
}

export interface DateSelectEvent {
    date: Date;
}

export let currentMonth;
export let minDate = null;
export let maxDate = null;
export let selectedDate = null;
export let isDateOpen;
export let isDateBlocked;
export let bookingLength = null;
export let disabled = false; 