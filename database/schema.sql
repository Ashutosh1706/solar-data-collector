-- NMTronics Solar Cell Production Data Collector Database Schema
-- Optimized for PostgreSQL

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL, -- 'Super Admin', 'Site Admin', 'Engineer', 'Operator', 'Maintenance Team'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Customer Sites
CREATE TABLE IF NOT EXISTS sites (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) UNIQUE NOT NULL,
    location VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Machines / Processes
CREATE TABLE IF NOT EXISTS machines (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    process_type VARCHAR(100) NOT NULL, -- 'Texture', 'Diffusion', 'Annealing', 'BSG', 'PSG', 'Poly PECVD', 'Front PECVD', 'Rear PECVD', 'Printer', 'TCP', 'ALD', 'TCI', 'Sorter'
    site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
    opc_ua_endpoint VARCHAR(255)
);

-- 4. Production Data Header
CREATE TABLE IF NOT EXISTS production_data (
    id SERIAL PRIMARY KEY,
    site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
    machine_id INTEGER REFERENCES machines(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    shift VARCHAR(20) NOT NULL, -- 'Shift A', 'Shift B', 'Shift C'
    operator_name VARCHAR(150),
    engineer_name VARCHAR(150),
    total_production INTEGER DEFAULT 0,
    good_wafers INTEGER DEFAULT 0,
    rejected_wafers INTEGER DEFAULT 0,
    broken_wafers INTEGER DEFAULT 0,
    yield_percentage DOUBLE PRECISION DEFAULT 0.0,
    breakage_percentage DOUBLE PRECISION DEFAULT 0.0,
    rejection_percentage DOUBLE PRECISION DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uniq_sheet UNIQUE (site_id, machine_id, date, shift)
);

-- 5. Shift Data (Hourly Entries inside each Production Sheet)
CREATE TABLE IF NOT EXISTS shift_data (
    id SERIAL PRIMARY KEY,
    production_data_id INTEGER REFERENCES production_data(id) ON DELETE CASCADE,
    hour_label VARCHAR(50) NOT NULL, -- e.g. '06:00 - 07:00'
    production_count INTEGER DEFAULT 0,
    breakage_count INTEGER DEFAULT 0,
    rejection_count INTEGER DEFAULT 0,
    good_count INTEGER DEFAULT 0, -- Writable Output count
    downtime_minutes INTEGER DEFAULT 0,
    remarks TEXT
);

-- 6. Breakage Data Reasons Log
CREATE TABLE IF NOT EXISTS breakage_data (
    id SERIAL PRIMARY KEY,
    production_data_id INTEGER REFERENCES production_data(id) ON DELETE CASCADE,
    hour_label VARCHAR(50),
    count INTEGER DEFAULT 0,
    reason VARCHAR(255) NOT NULL,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Rejection Data Reasons Log
CREATE TABLE IF NOT EXISTS rejection_data (
    id SERIAL PRIMARY KEY,
    production_data_id INTEGER REFERENCES production_data(id) ON DELETE CASCADE,
    hour_label VARCHAR(50),
    count INTEGER DEFAULT 0,
    reason VARCHAR(255) NOT NULL,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Downtime Logs per shift sheet
CREATE TABLE IF NOT EXISTS downtime_logs (
    id SERIAL PRIMARY KEY,
    production_data_id INTEGER REFERENCES production_data(id) ON DELETE CASCADE,
    machine_id INTEGER REFERENCES machines(id) ON DELETE CASCADE,
    stopped_time TIMESTAMP,
    start_time TIMESTAMP,
    stop_time TIMESTAMP,
    downtime_reason VARCHAR(255) NOT NULL,
    breakdown_reason TEXT,
    action_taken TEXT,
    duration_minutes INTEGER DEFAULT 0
);

-- 9. Shift Sheet Remarks Section
CREATE TABLE IF NOT EXISTS remarks (
    id SERIAL PRIMARY KEY,
    production_data_id INTEGER REFERENCES production_data(id) ON DELETE CASCADE,
    operator_remarks TEXT,
    engineer_remarks TEXT,
    maintenance_remarks TEXT,
    machine_remarks TEXT
);

-- 10. Alarms Table
CREATE TABLE IF NOT EXISTS alarms (
    id SERIAL PRIMARY KEY,
    machine_id INTEGER REFERENCES machines(id) ON DELETE CASCADE,
    severity VARCHAR(50) NOT NULL, -- 'Info', 'Warning', 'Critical'
    alarm_code VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    is_acknowledged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Maintenance Logs Table (Historical checksheet tickets)
CREATE TABLE IF NOT EXISTS maintenance_logs (
    id SERIAL PRIMARY KEY,
    machine_id INTEGER REFERENCES machines(id) ON DELETE CASCADE,
    maintenance_type VARCHAR(100) NOT NULL, -- 'Preventive', 'Breakdown'
    description TEXT NOT NULL,
    performed_by VARCHAR(150) NOT NULL,
    downtime_minutes INTEGER DEFAULT 0,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Spares Inventory Table
CREATE TABLE IF NOT EXISTS spares_inventory (
    id SERIAL PRIMARY KEY,
    item_name VARCHAR(255) UNIQUE NOT NULL,
    current_stock INTEGER DEFAULT 0,
    reorder_level INTEGER DEFAULT 5,
    machine_compatibility VARCHAR(255)
);

-- 13. Generated Reports Logs
CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    report_type VARCHAR(100) NOT NULL, -- 'Daily', 'Shift', 'Monthly'
    generated_by VARCHAR(150) NOT NULL,
    file_path VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
