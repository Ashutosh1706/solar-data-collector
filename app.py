import os
import sqlite3
import shutil
import uuid
from datetime import datetime, date, timedelta
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, Form, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DATABASE_FILE = "data_collector.db"

app = FastAPI(title="NMTronics Solar Production Data Collector API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Helper function to get database connection
DATABASE_URL = os.environ.get("DATABASE_URL")

class PostgresCursorWrapper:
    def __init__(self, cursor):
        self.cursor = cursor
        self._lastrowid = None

    def execute(self, query, params=None):
        query = query.replace("?", "%s")
        if "AUTOINCREMENT" in query:
            query = query.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
        
        if "INSERT OR IGNORE" in query:
            query = query.replace("INSERT OR IGNORE INTO", "INSERT INTO")
            if "daily_tool_entries" in query:
                query += " ON CONFLICT (site_id, date, tool_name) DO NOTHING"
            elif "sites" in query:
                query += " ON CONFLICT (name) DO NOTHING"
        
        if "ADD COLUMN" in query and "IF NOT EXISTS" not in query:
            query = query.replace("ADD COLUMN", "ADD COLUMN IF NOT EXISTS")

        is_insert = query.strip().upper().startswith("INSERT")
        if is_insert and "RETURNING" not in query.upper():
            query += " RETURNING id"
            self.cursor.execute(query, params)
            try:
                row = self.cursor.fetchone()
                self._lastrowid = row[0] if row else None
            except Exception:
                self._lastrowid = None
        else:
            self.cursor.execute(query, params)

    def executemany(self, query, seq_of_params):
        query = query.replace("?", "%s")
        if "INSERT OR IGNORE" in query:
            query = query.replace("INSERT OR IGNORE INTO", "INSERT INTO")
            if "sites" in query:
                query += " ON CONFLICT (name) DO NOTHING"
        self.cursor.executemany(query, seq_of_params)

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()

    @property
    def lastrowid(self):
        return self._lastrowid

class PostgresConnWrapper:
    def __init__(self, conn):
        self.conn = conn

    def cursor(self):
        import psycopg2.extras
        return PostgresCursorWrapper(self.conn.cursor(cursor_factory=psycopg2.extras.DictCursor))

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()

def get_client_ip(request: Request) -> str:
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    x_real_ip = request.headers.get("x-real-ip")
    if x_real_ip:
        return x_real_ip.strip()
    if request.client:
        return request.client.host
    return "127.0.0.1"

def get_db_conn():
    if DATABASE_URL:
        url = DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        import psycopg2
        conn = psycopg2.connect(url)
        return PostgresConnWrapper(conn)
    else:
        conn = sqlite3.connect(DATABASE_FILE)
        conn.row_factory = sqlite3.Row
        return conn

# Database Initialization & Seeding
def init_db():
    conn = get_db_conn()
    cursor = conn.cursor()
    
    # 1. Sites table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        location TEXT
    )
    """)
    
    # 2. Machines table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS machines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        process_type TEXT NOT NULL,
        site_id INTEGER,
        FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE CASCADE
    )
    """)
    
    # 3. Production records header
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS production_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER,
        machine_id INTEGER,
        date TEXT NOT NULL,
        shift TEXT NOT NULL,
        operator_name TEXT,
        engineer_name TEXT,
        remarks_operator TEXT,
        remarks_engineer TEXT,
        remarks_maintenance TEXT,
        total_production INTEGER DEFAULT 0,
        good_wafers INTEGER DEFAULT 0,
        rejected_wafers INTEGER DEFAULT 0,
        broken_wafers INTEGER DEFAULT 0,
        yield_percentage REAL DEFAULT 0.0,
        breakage_percentage REAL DEFAULT 0.0,
        rejection_percentage REAL DEFAULT 0.0,
        FOREIGN KEY(site_id) REFERENCES sites(id),
        FOREIGN KEY(machine_id) REFERENCES machines(id),
        UNIQUE(site_id, machine_id, date, shift)
    )
    """)
    
    # 4. Hourly entries details
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS hourly_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        production_record_id INTEGER,
        hour_label TEXT NOT NULL,
        total_input INTEGER DEFAULT 0,
        breakage_count INTEGER DEFAULT 0,
        rejection_count INTEGER DEFAULT 0,
        good_count INTEGER DEFAULT 0,
        downtime_minutes INTEGER DEFAULT 0,
        downtime_reason TEXT,
        remarks TEXT,
        FOREIGN KEY(production_record_id) REFERENCES production_records(id) ON DELETE CASCADE
    )
    """)

    # 5. NMT Team Maintenance Comments
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS maintenance_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER,
        machine_id INTEGER,
        comment TEXT NOT NULL,
        logged_by TEXT,
        logged_at TEXT,
        FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY(machine_id) REFERENCES machines(id) ON DELETE CASCADE
    )
    """)
    
    # 5b. Daily Tool entries
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS daily_tool_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        target INTEGER DEFAULT 110000,
        production INTEGER DEFAULT 0,
        breakage INTEGER DEFAULT 0,
        FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE CASCADE,
        UNIQUE(site_id, date, tool_name)
    )
    """)

    # 5c. Daily Updates / Announcements table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        image_path TEXT,
        timestamp TEXT NOT NULL
    )
    """)

    # 5e. Author IP lock table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS author_ips (
        author TEXT PRIMARY KEY,
        ip_address TEXT NOT NULL,
        registered_at TEXT NOT NULL
    )
    """)

    # 5d. SOP & RCA reports table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS rca_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER,
        doc_type TEXT NOT NULL,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        logged_by TEXT,
        filename TEXT NOT NULL,
        upload_date TEXT NOT NULL,
        FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE CASCADE
    )
    """)
    
    # 6. Database schema migration: add metadata column to hourly_entries if missing
    try:
        cursor.execute("ALTER TABLE hourly_entries ADD COLUMN metadata TEXT")
    except Exception:
        pass # Column already exists
    
    try:
        cursor.execute("ALTER TABLE hourly_entries ADD COLUMN good_count INTEGER DEFAULT 0")
    except Exception:
        pass # Column already exists

    try:
        cursor.execute("""
        UPDATE hourly_entries 
        SET good_count = total_input - breakage_count - rejection_count
        WHERE good_count = 0 AND total_input > 0;
        """)
    except Exception as e:
        print("Migration error:", e)
    
    conn.commit()
    
    # Check if sites are seeded
    cursor.execute("SELECT COUNT(*) FROM sites")
    if cursor.fetchone()[0] == 0:
        print("Seeding default sites and machines database...")
        # Seed customer sites (including spelling correction EMVEE)
        sites = [
            ("Tata Power Solar", "Bengaluru, Karnataka"),
            ("Premier Energies", "Hyderabad, Telangana"),
            ("RenewSys", "Hyderabad, Telangana"),
            ("EMVEE Solar", "Bengaluru, Karnataka"),
            ("MVP Solar", "Chennai, Tamil Nadu"),
            ("Adani Solar", "Mundra, Gujarat"),
            ("Waaree Solar", "Surat, Gujarat"),
            ("Vikram Solar", "Kolkata, West Bengal"),
            ("ReNew Solar", "Gurugram, Haryana")
        ]
        cursor.executemany("INSERT INTO sites (name, location) VALUES (?, ?)", sites)
        conn.commit()
        
        # Get site IDs
        cursor.execute("SELECT id, name FROM sites")
        site_map = {row["name"]: row["id"] for row in cursor.fetchall()}
        
        # Seed the 18 specific machines for EACH site
        machines = []
        processes = [
            ("TEXTURE 1", "Texture"),
            ("TEXTURE 2", "Texture"),
            ("Diffusion 1", "Diffusion"),
            ("Diffusion 2", "Diffusion"),
            ("BSG 1", "BSG"),
            ("BSG 2", "BSG"),
            ("POLY PECVD 1", "Poly PECVD"),
            ("POLY PECVD 2", "Poly PECVD"),
            ("POLY PECVD 3", "Poly PECVD"),
            ("Annealing 1", "Annealing"),
            ("Annealing 2", "Annealing"),
            ("Front PECVD 1", "Front PECVD"),
            ("Front PECVD 2", "Front PECVD"),
            ("Front PECVD 3", "Front PECVD"),
            ("Rear PECVD 1", "Rear PECVD"),
            ("Rear PECVD 2", "Rear PECVD"),
            ("Rear PECVD 3", "Rear PECVD"),
            ("Printer 1", "Printer"),
            ("Printer 2", "Printer")
        ]
        
        for site_name, site_id in site_map.items():
            for m_name, proc in processes:
                # e.g., "Tata - TEXTURE 1"
                machines.append((f"{site_name.split()[0]} - {m_name}", proc, site_id))
        
        cursor.executemany("INSERT INTO machines (name, process_type, site_id) VALUES (?, ?, ?)", machines)
        conn.commit()
        
        # Seed some mock production sheets for Tata TEXTURE 1 and Diffusion 1
        print("Seeding past sheets...")
        today = date.today()
        shift_hours = {
            "Shift A": ["06:00 - 07:00", "07:00 - 08:00", "08:00 - 09:00", "09:00 - 10:00", "10:00 - 11:00", "11:00 - 12:00", "12:00 - 13:00", "13:00 - 14:00"],
            "Shift B": ["14:00 - 15:00", "15:00 - 16:00", "16:00 - 17:00", "17:00 - 18:00", "18:00 - 19:00", "19:00 - 20:00", "20:00 - 21:00", "21:00 - 22:00"],
            "Shift C": ["22:00 - 23:00", "23:00 - 00:00", "00:00 - 01:00", "01:00 - 02:00", "02:00 - 03:00", "03:00 - 04:00", "04:00 - 05:00", "05:00 - 06:00"]
        }
        
        # Select first 4 machines
        cursor.execute("SELECT id, site_id, name FROM machines LIMIT 4")
        machines_seeded = cursor.fetchall()
        
        import random
        for offset in range(3, 0, -1):
            target_date = (today - timedelta(days=offset)).isoformat()
            for mach in machines_seeded:
                for shift, hours in shift_hours.items():
                    cursor.execute("""
                    INSERT INTO production_records (site_id, machine_id, date, shift, operator_name, engineer_name, remarks_operator, remarks_engineer)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        mach["site_id"], mach["id"], target_date, shift,
                        "Operator Dave", "Process Engineer Lee",
                        "Normal shift operations completed.", "Yield metrics within specified target."
                    ))
                    record_id = cursor.lastrowid
                    
                    tot_in = 0
                    tot_br = 0
                    tot_re = 0
                    for hr in hours:
                        h_in = random.randint(2800, 3200)
                        h_br = random.randint(4, 15)
                        h_re = random.randint(8, 20)
                        h_dt = random.choice([0, 0, 0, 0, 0, 15]) 
                        h_dtr = "Conveyor jam cleared" if h_dt > 0 else ""
                        
                        tot_in += h_in
                        tot_br += h_br
                        tot_re += h_re
                        
                        cursor.execute("""
                        INSERT INTO hourly_entries (production_record_id, hour_label, total_input, breakage_count, rejection_count, downtime_minutes, downtime_reason)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, (record_id, hr, h_in, h_br, h_re, h_dt, h_dtr))
                    
                    tot_good = tot_in - tot_br - tot_re
                    
                    # Yield, Breakage & Rejection rates computed against OUTPUT (Good Wafers)
                    y_pct = round((tot_good / tot_in) * 100, 2) if tot_in > 0 else 0
                    b_pct = round((tot_br / tot_good) * 100, 2) if tot_good > 0 else 0
                    r_pct = round((tot_re / tot_good) * 100, 2) if tot_good > 0 else 0
                    
                    cursor.execute("""
                    UPDATE production_records SET
                        total_production = ?, good_wafers = ?, broken_wafers = ?, rejected_wafers = ?,
                        yield_percentage = ?, breakage_percentage = ?, rejection_percentage = ?
                    WHERE id = ?
                    """, (tot_in, tot_good, tot_br, tot_re, y_pct, b_pct, r_pct, record_id))
                    
        # Seed mock maintenance comments
        cursor.execute("SELECT id, site_id, id as mach_id FROM machines LIMIT 3")
        m_rows = cursor.fetchall()
        for idx, m_row in enumerate(m_rows):
            cursor.execute("""
            INSERT INTO maintenance_comments (site_id, machine_id, comment, logged_by, logged_at)
            VALUES (?, ?, ?, ?, ?)
            """, (m_row["site_id"], m_row["mach_id"], f"NMT Team completed weekly preventative alignment for conveyor on line {idx+1}.", "Sarah Technician", datetime.now().isoformat()))
            
        conn.commit()
    conn.close()

# Pydantic Schemas
class LoadSheetRequest(BaseModel):
    site_id: int
    machine_id: int
    date: str
    shift: str
    custom_hours: Optional[List[str]] = None

class SaveRowRequest(BaseModel):
    record_id: int
    row_id: int
    total_input: int
    breakage_count: int
    rejection_count: int
    good_count: Optional[int] = 0
    downtime_minutes: int
    downtime_reason: str
    remarks: str
    metadata: Optional[str] = None

class SaveSummaryRequest(BaseModel):
    record_id: int
    total_input: int
    breakage_count: int
    rejection_count: int
    good_count: Optional[int] = 0
    downtime_minutes: int
    downtime_reason: str
    remarks: str

class SaveMetadataRequest(BaseModel):
    record_id: int
    operator_name: str
    engineer_name: str
    remarks_operator: str
    remarks_engineer: str
    remarks_maintenance: str

class CustomSiteRequest(BaseModel):
    name: str
    location: str

class CustomMachineRequest(BaseModel):
    name: str
    process_type: str
    site_id: int

class MaintenanceCommentRequest(BaseModel):
    site_id: int
    machine_id: int
    comment: str
    logged_by: str

class LoadDailyToolRequest(BaseModel):
    site_id: int
    date: str

class ToolEntry(BaseModel):
    tool_name: str
    target: int
    production: int
    breakage: int

class SaveDailyToolSheetRequest(BaseModel):
    site_id: int
    date: str
    entries: List[ToolEntry]

class DeleteDailyToolRequest(BaseModel):
    site_id: int
    date: str
    tool_name: str

# Initialize Database on application startup
init_db()

# REST Endpoints
@app.get("/api/config")
def get_config():
    conn = get_db_conn()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM sites ORDER BY name ASC")
    sites = [dict(row) for row in cursor.fetchall()]
    
    cursor.execute("SELECT * FROM machines ORDER BY name ASC")
    machines = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    return {"sites": sites, "machines": machines}

@app.post("/api/records/load-or-create")
def load_or_create_sheet(req: LoadSheetRequest):
    conn = get_db_conn()
    cursor = conn.cursor()
    
    # 1. Try to fetch existing header
    cursor.execute("""
    SELECT r.*, s.name as site_name, m.name as machine_name 
    FROM production_records r
    JOIN sites s ON r.site_id = s.id
    JOIN machines m ON r.machine_id = m.id
    WHERE r.site_id = ? AND r.machine_id = ? AND r.date = ? AND r.shift = ?
    """, (req.site_id, req.machine_id, req.date, req.shift))
    
    record = cursor.fetchone()
    
    if record:
        record_id = record["id"]
        # Fetch hourly rows
        cursor.execute("SELECT * FROM hourly_entries WHERE production_record_id = ? ORDER BY id", (record_id,))
        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return {"record": dict(record), "rows": rows}
    
    # 2. Create a new sheet if none exists
    if req.custom_hours and len(req.custom_hours) > 0:
        hours = req.custom_hours
    else:
        shift_hours = {
            "Shift A": ["06:00 - 07:00", "07:00 - 08:00", "08:00 - 09:00", "09:00 - 10:00", "10:00 - 11:00", "11:00 - 12:00", "12:00 - 13:00", "13:00 - 14:00"],
            "Shift B": ["14:00 - 15:00", "15:00 - 16:00", "16:00 - 17:00", "17:00 - 18:00", "18:00 - 19:00", "19:00 - 20:00", "20:00 - 21:00", "21:00 - 22:00"],
            "Shift C": ["22:00 - 23:00", "23:00 - 00:00", "00:00 - 01:00", "01:00 - 02:00", "02:00 - 03:00", "03:00 - 04:00", "04:00 - 05:00", "05:00 - 06:00"]
        }
        hours = shift_hours.get(req.shift, shift_hours["Shift A"])
    
    try:
        cursor.execute("""
        INSERT INTO production_records (site_id, machine_id, date, shift, operator_name, engineer_name)
        VALUES (?, ?, ?, ?, '', '')
        """, (req.site_id, req.machine_id, req.date, req.shift))
        record_id = cursor.lastrowid
        
        # Insert blank hourly entries
        for hr in hours:
            cursor.execute("""
            INSERT INTO hourly_entries (production_record_id, hour_label, total_input, breakage_count, rejection_count, good_count, downtime_minutes, downtime_reason, remarks)
            VALUES (?, ?, 0, 0, 0, 0, 0, '', '')
            """, (record_id, hr))
            
        conn.commit()
        
        # Refetch the created record
        cursor.execute("""
        SELECT r.*, s.name as site_name, m.name as machine_name 
        FROM production_records r
        JOIN sites s ON r.site_id = s.id
        JOIN machines m ON r.machine_id = m.id
        WHERE r.id = ?
        """, (record_id,))
        record = cursor.fetchone()
        
        cursor.execute("SELECT * FROM hourly_entries WHERE production_record_id = ? ORDER BY id", (record_id,))
        rows = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        return {"record": dict(record), "rows": rows}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to create new sheet: {e}")

@app.post("/api/records/save-row")
def save_row(req: SaveRowRequest):
    conn = get_db_conn()
    cursor = conn.cursor()
    
    try:
        # 1. Update the row entry
        cursor.execute("""
        UPDATE hourly_entries SET
            total_input = ?, breakage_count = ?, rejection_count = ?, good_count = ?,
            downtime_minutes = ?, downtime_reason = ?, remarks = ?, metadata = ?
        WHERE id = ? AND production_record_id = ?
        """, (
            req.total_input, req.breakage_count, req.rejection_count, req.good_count,
            req.downtime_minutes, req.downtime_reason, req.remarks, req.metadata,
            req.row_id, req.record_id
        ))
        
        # 2. Recalculate aggregates from all rows in the sheet
        cursor.execute("""
        SELECT SUM(total_input) as tot_in, SUM(breakage_count) as tot_br, SUM(rejection_count) as tot_re, SUM(good_count) as tot_good
        FROM hourly_entries
        WHERE production_record_id = ?
        """, (req.record_id,))
        aggregates = cursor.fetchone()
        
        tot_in = aggregates["tot_in"] or 0
        tot_br = aggregates["tot_br"] or 0
        tot_re = aggregates["tot_re"] or 0
        tot_good = aggregates["tot_good"] or 0
        
        # Yield, Breakage & Rejection rates computed against OUTPUT (Good Wafers)
        y_pct = round((tot_good / tot_in) * 100, 2) if tot_in > 0 else 0.0
        b_pct = round((tot_br / tot_good) * 100, 2) if tot_good > 0 else 0.0
        r_pct = round((tot_re / tot_good) * 100, 2) if tot_good > 0 else 0.0
        
        # Update header record
        cursor.execute("""
        UPDATE production_records SET
            total_production = ?, good_wafers = ?, broken_wafers = ?, rejected_wafers = ?,
            yield_percentage = ?, breakage_percentage = ?, rejection_percentage = ?
        WHERE id = ?
        """, (tot_in, tot_good, tot_br, tot_re, y_pct, b_pct, r_pct, req.record_id))
        
        conn.commit()
        
        # Refetch the updated aggregates
        cursor.execute("SELECT * FROM production_records WHERE id = ?", (req.record_id,))
        updated_record = cursor.fetchone()
        
        conn.close()
        return {"status": "success", "record": dict(updated_record)}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/records/save-summary")
def save_summary(req: SaveSummaryRequest):
    conn = get_db_conn()
    cursor = conn.cursor()
    try:
        # Get all hourly entries for this record
        cursor.execute("SELECT id FROM hourly_entries WHERE production_record_id = ? ORDER BY id", (req.record_id,))
        rows = [dict(row) for row in cursor.fetchall()]
        num_hours = len(rows)
        if num_hours > 0:
            base_input = req.total_input // num_hours
            rem_input = req.total_input % num_hours
            base_break = req.breakage_count // num_hours
            rem_break = req.breakage_count % num_hours
            base_reject = req.rejection_count // num_hours
            rem_reject = req.rejection_count % num_hours
            base_downtime = req.downtime_minutes // num_hours
            rem_downtime = req.downtime_minutes % num_hours
            
            # Writable Output: Distribute good_count across the hours as well
            good_total = req.good_count if req.good_count is not None else (req.total_input - req.breakage_count)
            base_good = good_total // num_hours
            rem_good = good_total % num_hours

            for idx, row in enumerate(rows):
                h_input = base_input + (rem_input if idx == 0 else 0)
                h_break = base_break + (rem_break if idx == 0 else 0)
                h_reject = base_reject + (rem_reject if idx == 0 else 0)
                h_good = base_good + (rem_good if idx == 0 else 0)
                h_downtime = base_downtime + (rem_downtime if idx == 0 else 0)
                h_reason = req.downtime_reason if idx == 0 else ""
                h_remarks = req.remarks if idx == 0 else ""
                
                cursor.execute("""
                UPDATE hourly_entries SET
                    total_input = ?, breakage_count = ?, rejection_count = ?, good_count = ?,
                    downtime_minutes = ?, downtime_reason = ?, remarks = ?, metadata = NULL
                WHERE id = ?
                """, (h_input, h_break, h_reject, h_good, h_downtime, h_reason, h_remarks, row["id"]))
                
        # Recalculate aggregates from all rows in the sheet
        tot_good = req.good_count if req.good_count is not None else (req.total_input - req.breakage_count)
        
        # Yield, Breakage & Rejection rates computed against OUTPUT (Good Wafers)
        y_pct = round((tot_good / req.total_input) * 100, 2) if req.total_input > 0 else 0.0
        b_pct = round((req.breakage_count / tot_good) * 100, 2) if tot_good > 0 else 0.0
        r_pct = round((req.rejection_count / tot_good) * 100, 2) if tot_good > 0 else 0.0
        
        cursor.execute("""
        UPDATE production_records SET
            total_production = ?, good_wafers = ?, broken_wafers = ?, rejected_wafers = ?,
            yield_percentage = ?, breakage_percentage = ?, rejection_percentage = ?,
            remarks_operator = ?
        WHERE id = ?
        """, (req.total_input, tot_good, req.breakage_count, req.rejection_count, y_pct, b_pct, r_pct, req.remarks, req.record_id))
        
        conn.commit()
        
        # Refetch the updated aggregates
        cursor.execute("SELECT * FROM production_records WHERE id = ?", (req.record_id,))
        updated_record = cursor.fetchone()
        
        conn.close()
        return {"status": "success", "record": dict(updated_record)}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/records/save-metadata")
def save_metadata(req: SaveMetadataRequest):
    conn = get_db_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        UPDATE production_records SET
            operator_name = ?, engineer_name = ?,
            remarks_operator = ?, remarks_engineer = ?, remarks_maintenance = ?
        WHERE id = ?
        """, (
            req.operator_name, req.engineer_name,
            req.remarks_operator, req.remarks_engineer, req.remarks_maintenance,
            req.record_id
        ))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/records/history")
def get_history(
    site_id: Optional[int] = None, 
    machine_id: Optional[int] = None, 
    date_str: Optional[str] = None, 
    month_str: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    conn = get_db_conn()
    cursor = conn.cursor()
    
    query = """
    SELECT r.*, s.name as site_name, m.name as machine_name 
    FROM production_records r
    JOIN sites s ON r.site_id = s.id
    JOIN machines m ON r.machine_id = m.id
    """
    params = []
    conditions = []
    
    if site_id:
        conditions.append("r.site_id = ?")
        params.append(site_id)
    if machine_id:
        conditions.append("r.machine_id = ?")
        params.append(machine_id)
    if date_str:
        conditions.append("r.date = ?")
        params.append(date_str)
    elif month_str:
        conditions.append("r.date LIKE ?")
        params.append(f"{month_str}-%")
    
    if start_date:
        conditions.append("r.date >= ?")
        params.append(start_date)
    if end_date:
        conditions.append("r.date <= ?")
        params.append(end_date)
        
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
        
    query += " ORDER BY r.date DESC, r.shift ASC"
    
    cursor.execute(query, params)
    records = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return records

@app.get("/api/analytics/dashboard")
def get_analytics():
    conn = get_db_conn()
    cursor = conn.cursor()
    
    # Site-wise breakage & production aggregates
    cursor.execute("""
    SELECT s.name as site_name, SUM(r.total_production) as total_prod, SUM(r.broken_wafers) as total_broken, SUM(r.rejected_wafers) as total_rejected
    FROM production_records r
    JOIN sites s ON r.site_id = s.id
    GROUP BY r.site_id, s.name
    """)
    site_performance = [dict(row) for row in cursor.fetchall()]
    
    # Downtime causes (Pareto analysis)
    cursor.execute("""
    SELECT downtime_reason as reason, SUM(downtime_minutes) as minutes
    FROM hourly_entries
    WHERE downtime_minutes > 0 AND downtime_reason IS NOT NULL AND downtime_reason != ''
    GROUP BY downtime_reason
    ORDER BY minutes DESC
    """)
    downtime_reasons = [dict(row) for row in cursor.fetchall()]
    
    # Yield trend by date
    cursor.execute("""
    SELECT date, AVG(yield_percentage) as avg_yield, AVG(breakage_percentage) as avg_breakage
    FROM production_records
    GROUP BY date
    ORDER BY date ASC
    LIMIT 15
    """)
    yield_trends = [dict(row) for row in cursor.fetchall()]

    # Downtime trends by date
    cursor.execute("""
    SELECT r.date, SUM(h.downtime_minutes) as total_downtime
    FROM production_records r
    JOIN hourly_entries h ON r.id = h.production_record_id
    GROUP BY r.date
    ORDER BY r.date ASC
    LIMIT 15
    """)
    downtime_trends = [dict(row) for row in cursor.fetchall()]

    conn.close()
    return {
        "site_performance": site_performance,
        "downtime_reasons": downtime_reasons,
        "yield_trends": yield_trends,
        "downtime_trends": downtime_trends
    }

@app.post("/api/sites")
def add_site(req: CustomSiteRequest):
    conn = get_db_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO sites (name, location) VALUES (?, ?)", (req.name, req.location))
        conn.commit()
        conn.close()
        return {"status": "success", "message": "Site added successfully"}
    except Exception as e:
        conn.close()
        if "IntegrityError" in type(e).__name__ or "unique constraint" in str(e).lower():
            raise HTTPException(status_code=400, detail="Site name already exists")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/machines")
def add_machine(req: CustomMachineRequest):
    conn = get_db_conn()
    cursor = conn.cursor()
    try:
        # e.g., "Tata - TEXTURE 3"
        cursor.execute("SELECT name FROM sites WHERE id = ?", (req.site_id,))
        site_row = cursor.fetchone()
        site_name = site_row["name"] if site_row else "Site"
        full_machine_name = f"{site_name.split()[0]} - {req.name}"
        
        cursor.execute("INSERT INTO machines (name, process_type, site_id) VALUES (?, ?, ?)", (full_machine_name, req.process_type, req.site_id))
        conn.commit()
        conn.close()
        return {"status": "success", "message": "Machine added successfully"}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- MAINTENANCE COMMENTS ENDPOINTS -----------------
@app.post("/api/maintenance/comments")
def add_maintenance_comment(req: MaintenanceCommentRequest):
    conn = get_db_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        INSERT INTO maintenance_comments (site_id, machine_id, comment, logged_by, logged_at)
        VALUES (?, ?, ?, ?, ?)
        """, (req.site_id, req.machine_id, req.comment, req.logged_by, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
        conn.commit()
        conn.close()
        return {"status": "success", "message": "NMT Maintenance comment logged successfully"}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/maintenance/comments")
def get_maintenance_comments(site_id: Optional[int] = None, machine_id: Optional[int] = None):
    conn = get_db_conn()
    cursor = conn.cursor()
    query = """
    SELECT c.*, s.name as site_name, m.name as machine_name 
    FROM maintenance_comments c
    JOIN sites s ON c.site_id = s.id
    JOIN machines m ON c.machine_id = m.id
    """
    params = []
    conditions = []
    if site_id:
        conditions.append("c.site_id = ?")
        params.append(site_id)
    if machine_id:
        conditions.append("c.machine_id = ?")
        params.append(machine_id)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY c.logged_at DESC"
    cursor.execute(query, params)
    comments = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return comments

# ----------------- DAILY TOOL RECORDS ENDPOINTS -----------------
@app.post("/api/daily-tool-records/load-or-create")
def load_or_create_daily_tool_sheet(req: LoadDailyToolRequest):
    conn = get_db_conn()
    cursor = conn.cursor()
    
    # 1. Fetch existing entries
    cursor.execute("""
    SELECT * FROM daily_tool_entries
    WHERE site_id = ? AND date = ?
    ORDER BY id ASC
    """, (req.site_id, req.date))
    rows = [dict(row) for row in cursor.fetchall()]
    
    if len(rows) > 0:
        conn.close()
        return {"site_id": req.site_id, "date": req.date, "rows": rows}
        
    # 2. Seed default 12 tools if none exist
    tools = [
        "Incoming", "Texture", "Diffusion", "BSG-Polishing", "Poly-PECVD", 
        "Poly-Annealing", "PSG-Polishing", "ALD", "Front-PECVD", "Rear-PECVD", 
        "Print Line", "Packing"
    ]
    
    try:
        for tool in tools:
            cursor.execute("""
            INSERT OR IGNORE INTO daily_tool_entries (site_id, date, tool_name, target, production, breakage)
            VALUES (?, ?, ?, 110000, 0, 0)
            """, (req.site_id, req.date, tool))
        conn.commit()
        
        # Re-fetch
        cursor.execute("""
        SELECT * FROM daily_tool_entries
        WHERE site_id = ? AND date = ?
        ORDER BY id ASC
        """, (req.site_id, req.date))
        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return {"site_id": req.site_id, "date": req.date, "rows": rows}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to load or seed daily tool sheet: {e}")

@app.post("/api/daily-tool-records/save-sheet")
def save_daily_tool_sheet(req: SaveDailyToolSheetRequest):
    conn = get_db_conn()
    cursor = conn.cursor()
    try:
        for entry in req.entries:
            cursor.execute("""
            INSERT INTO daily_tool_entries (site_id, date, tool_name, target, production, breakage)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(site_id, date, tool_name) DO UPDATE SET
                target = excluded.target,
                production = excluded.production,
                breakage = excluded.breakage
            """, (req.site_id, req.date, entry.tool_name, entry.target, entry.production, entry.breakage))
        conn.commit()
        conn.close()
        return {"status": "success", "message": "Daily tool sheet saved successfully"}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to save daily tool sheet: {e}")

@app.get("/api/daily-tool-records/history")
def get_daily_tool_history(
    site_id: int,
    start_date: str,
    end_date: str
):
    conn = get_db_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        SELECT d.*, s.name as site_name
        FROM daily_tool_entries d
        JOIN sites s ON d.site_id = s.id
        WHERE d.site_id = ? AND d.date >= ? AND d.date <= ?
        ORDER BY d.date ASC, d.id ASC
        """, (site_id, start_date, end_date))
        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return rows
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to load daily tool history: {e}")

@app.post("/api/daily-tool-records/delete-tool")
def delete_daily_tool_entry(req: DeleteDailyToolRequest):
    conn = get_db_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        DELETE FROM daily_tool_entries
        WHERE site_id = ? AND date = ? AND tool_name = ?
        """, (req.site_id, req.date, req.tool_name))
        conn.commit()
        conn.close()
        return {"status": "success", "message": "Daily tool entry deleted successfully"}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

# Initialize Upload folders
UPLOAD_DIR = "uploads"
os.makedirs(os.path.join(UPLOAD_DIR, "rca"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "announcements"), exist_ok=True)

# ----------------- RCA & SOP DOCUMENTS ENDPOINTS -----------------
@app.post("/api/rca")
async def upload_rca_report(
    title: str = Form(...),
    site_id: int = Form(...),
    doc_type: str = Form(...),
    date: str = Form(...),
    logged_by: str = Form(...),
    file: UploadFile = File(...)
):
    conn = get_db_conn()
    cursor = conn.cursor()
    try:
        ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{ext}"
        filepath = os.path.join(UPLOAD_DIR, "rca", unique_filename)
        
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        upload_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        cursor.execute("""
        INSERT INTO rca_reports (site_id, doc_type, title, date, logged_by, filename, upload_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (site_id, doc_type, title, date, logged_by, unique_filename, upload_date))
        conn.commit()
        conn.close()
        return {"status": "success", "message": "Document uploaded successfully"}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/rca")
def get_rca_reports():
    conn = get_db_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        SELECT r.*, s.name as site_name
        FROM rca_reports r
        LEFT JOIN sites s ON r.site_id = s.id
        ORDER BY r.upload_date DESC
        """)
        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return rows
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/rca/{doc_id}")
def delete_rca_report(doc_id: int):
    conn = get_db_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT filename FROM rca_reports WHERE id = ?", (doc_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Document not found")
        
        filename = row["filename"]
        filepath = os.path.join(UPLOAD_DIR, "rca", filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            
        cursor.execute("DELETE FROM rca_reports WHERE id = ?", (doc_id,))
        conn.commit()
        conn.close()
        return {"status": "success", "message": "Document deleted successfully"}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- ANNOUNCEMENTS FEED ENDPOINTS -----------------
@app.post("/api/announcements")
async def post_announcement(
    request: Request,
    author: str = Form(...),
    content: str = Form(...),
    image: Optional[UploadFile] = File(None)
):
    conn = get_db_conn()
    cursor = conn.cursor()
    try:
        # Enforce name locking to client IP
        clean_author = author.strip()
        author_key = clean_author.lower()
        client_ip = get_client_ip(request)
        
        cursor.execute("SELECT ip_address FROM author_ips WHERE author = ?", (author_key,))
        row = cursor.fetchone()
        if row:
            registered_ip = row["ip_address"]
            if registered_ip != client_ip:
                conn.close()
                raise HTTPException(
                    status_code=403, 
                    detail=f"The author name '{clean_author}' is locked to a different system to prevent impersonation."
                )
        else:
            # Register this name to this IP
            cursor.execute("""
            INSERT INTO author_ips (author, ip_address, registered_at)
            VALUES (?, ?, ?)
            """, (author_key, client_ip, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
            conn.commit()

        image_filename = None
        if image and image.filename:
            ext = os.path.splitext(image.filename)[1]
            image_filename = f"{uuid.uuid4()}{ext}"
            filepath = os.path.join(UPLOAD_DIR, "announcements", image_filename)
            with open(filepath, "wb") as buffer:
                shutil.copyfileobj(image.file, buffer)
                
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("""
        INSERT INTO announcements (author, content, image_path, timestamp)
        VALUES (?, ?, ?, ?)
        """, (clean_author, content, image_filename, timestamp))
        conn.commit()
        conn.close()
        return {"status": "success", "message": "Announcement posted successfully"}
    except HTTPException as he:
        raise he
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/announcements")
def get_announcements():
    conn = get_db_conn()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM announcements ORDER BY timestamp DESC")
        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return rows
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

# Mount static folders
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

static_dir = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)

app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8080)
