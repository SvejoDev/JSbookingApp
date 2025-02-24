-- Lägg till system_settings tabell för konfigurerbara värden
CREATE TABLE system_settings (
    id serial4 NOT NULL PRIMARY KEY,
    setting_key varchar(50) NOT NULL UNIQUE,
    setting_value varchar(255) NOT NULL,
    description text,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
);

-- Lägg till rebooking_history tabell
CREATE TABLE rebooking_history (
    id serial4 NOT NULL PRIMARY KEY,
    booking_id int4 NOT NULL REFERENCES bookings(id),
    previous_start_date date NOT NULL,
    previous_start_time time NOT NULL,
    new_start_date date NOT NULL,
    new_start_time time NOT NULL,
    changed_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    changed_by varchar(255) NOT NULL
);

-- Lägg till standardvärde för ombokningsgräns
INSERT INTO system_settings (setting_key, setting_value, description) 
VALUES ('rebooking_deadline_hours', '6', 'Antal timmar innan start som ombokning är tillåten'); 