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