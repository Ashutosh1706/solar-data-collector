// NMTronics Solar Cell MES - Main Application Controller (Revised)

const API_BASE = ""; // Relative path matches FastAPI server mount

// Global Application State
let currentUser = { username: "admin", role: "Super Admin", fullName: "Fab Administrator" };
let currentSheetHeader = null;
let currentSheetRows = [];
let configData = { sites: [], machines: [] };
let saveTimeout = null;


// Predefined Demo Users (with passwords)
const DEMO_USERS = [
    { username: "admin",         password: "admin123",  role: "Super Admin",       fullName: "Fab Administrator" },
    { username: "engineer_lee",  password: "eng123",    role: "Engineer",           fullName: "Engineer Lee" },
    { username: "operator_dave", password: "op123",     role: "Operator",           fullName: "Dave Operator" },
    { username: "maint_sarah",   password: "maint123",  role: "Maintenance Team",   fullName: "Sarah Technician" }
];



function initApp() {
    const modules = [
        { name: "Clock", fn: initClock },
        { name: "AppRouting", fn: initAppRouting },
        { name: "LoginForm", fn: initLoginForm },
        { name: "DataEntryGrid", fn: initDataEntryGrid },
        { name: "SiteComparison", fn: initSiteComparison },
        { name: "MaintenancePortal", fn: initMaintenancePortal },
        { name: "ConfigurationPanel", fn: initConfigurationPanel },
        { name: "ReportsSearch", fn: initReportsSearch },
        { name: "MonthlySummary", fn: initMonthlySummary },
        { name: "DailyToolSheet", fn: initDailyToolSheet },
        { name: "RcaPortal", fn: initRcaPortal },
        { name: "Announcements", fn: initAnnouncements },
        { name: "LoadConfigData", fn: loadConfigData },
        { name: "ProcessSpecificModals", fn: initProcessSpecificModals },
        { name: "MobileMenu", fn: initMobileMenu }
    ];

    modules.forEach(mod => {
        try {
            mod.fn();
        } catch (err) {
            console.error(`Error during ${mod.name} initialization:`, err);
        }
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}

// 1. Clock Engine
function initClock() {
    const timeWidget = document.getElementById("current-time");
    const updateTime = () => {
        const now = new Date();
        timeWidget.textContent = now.toLocaleDateString() + " " + now.toTimeString().slice(0, 8);
    };
    updateTime();
    setInterval(updateTime, 1000);
}

// 2. Authentication and Navigation Controllers
function initLoginForm() {
    // Authentication is bypassed. We set the default user globally.
    const avatarEl = document.getElementById("user-avatar");
    const nameEl = document.getElementById("user-display-name");
    const roleEl = document.getElementById("user-display-role");
    if (avatarEl) avatarEl.textContent = currentUser.fullName.slice(0, 2).toUpperCase();
    if (nameEl) nameEl.textContent = currentUser.fullName;
    if (roleEl) roleEl.textContent = currentUser.role;

    const configBtn = document.getElementById("nav-btn-config");
    if (configBtn) configBtn.style.display = "flex";

    const btnLogout = document.getElementById("btn-logout");
    if (btnLogout) {
        btnLogout.style.display = "none"; // Hide sign out button since login is removed!
    }
}

function initAppRouting() {
    const navButtons = document.querySelectorAll(".nav-btn");
    const viewPanels = document.querySelectorAll(".view-panel");
    const titleLabel = document.getElementById("page-title-label");
    
    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            if (!currentUser) return;
            
            const target = btn.getAttribute("data-target");
            
            navButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            viewPanels.forEach(panel => {
                panel.classList.remove("active");
                if (panel.id === target) {
                    panel.classList.add("active");
                }
            });
            
            titleLabel.textContent = btn.textContent.trim();
            
            // Reload specific page components on navigation
            if (target === "reports-view") {
                loadHistoryTable();
            } else if (target === "maintenance-view") {
                loadMaintenanceComments();
            } else if (target === "home-view") {
                loadDashboardData();
            } else if (target === "rca-view") {
                loadRcaDocuments();
            } else if (target === "announcements-view") {
                loadAnnouncements();
            }
        });
    });
}

// // 3. Dropdown Config Seeding
function loadConfigData() {
    return fetch(`${API_BASE}/api/config`)
        .then(res => res.json())
        .then(data => {
            configData = data;
            
            // Selection dropdown elements mapping safely
            const selectSite = document.getElementById("select-site");
            const selectMachine = document.getElementById("select-machine");
            const filterSite = document.getElementById("history-site");
            const configSite = document.getElementById("machine-site-select");
            
            const compSiteA = document.getElementById("compare-site-a");
            const compSiteB = document.getElementById("compare-site-b");
            const maintSiteSelect = document.getElementById("maint-site-select");
            const maintChamberSelect = document.getElementById("maint-chamber-select");
            
            const monthlySite = document.getElementById("monthly-site");
            const monthlyMachine = document.getElementById("monthly-machine");
            
            const dailyToolSite = document.getElementById("daily-tool-site");
            const rcaSiteSelect = document.getElementById("rca-site-select");
            
            // Save selected values to restore them after populating
            const prevSelectSite = selectSite ? selectSite.value : "";
            const prevSelectMachine = selectMachine ? selectMachine.value : "";
            const prevFilterSite = filterSite ? filterSite.value : "";
            const prevConfigSite = configSite ? configSite.value : "";
            const prevCompSiteA = compSiteA ? compSiteA.value : "";
            const prevCompSiteB = compSiteB ? compSiteB.value : "";
            const prevMaintSite = maintSiteSelect ? maintSiteSelect.value : "";
            const prevMaintChamber = maintChamberSelect ? maintChamberSelect.value : "";
            const prevMonthlySite = monthlySite ? monthlySite.value : "";
            const prevMonthlyMachine = monthlyMachine ? monthlyMachine.value : "";
            const prevDailyToolSite = dailyToolSite ? dailyToolSite.value : "";
            const prevRcaSite = rcaSiteSelect ? rcaSiteSelect.value : "";
 
            // Reset dropdowns safely
            if (selectSite) selectSite.innerHTML = `<option value="">-- Choose Site --</option>`;
            if (selectMachine) selectMachine.innerHTML = `<option value="">-- Choose Site First --</option>`;
            if (filterSite) filterSite.innerHTML = `<option value="">All Sites</option>`;
            if (configSite) configSite.innerHTML = `<option value="">-- Link to Site --</option>`;
            
            if (compSiteA) compSiteA.innerHTML = `<option value="">-- Choose Site A --</option>`;
            if (compSiteB) compSiteB.innerHTML = `<option value="">-- Choose Site B --</option>`;
            if (maintSiteSelect) maintSiteSelect.innerHTML = `<option value="">-- Choose Site --</option>`;
            if (maintChamberSelect) maintChamberSelect.innerHTML = `<option value="">-- Choose Site First --</option>`;
            
            if (monthlySite) monthlySite.innerHTML = `<option value="">-- Choose Site --</option>`;
            if (monthlyMachine) monthlyMachine.innerHTML = `<option value="">All Machines</option>`;
            
            if (dailyToolSite) dailyToolSite.innerHTML = `<option value="">-- Choose Site --</option>`;
            if (rcaSiteSelect) rcaSiteSelect.innerHTML = `<option value="">-- Choose Site --</option>`;
            
            data.sites.forEach(site => {
                const opt = `<option value="${site.id}">${site.name}</option>`;
                if (selectSite) selectSite.innerHTML += opt;
                if (filterSite) filterSite.innerHTML += opt;
                if (configSite) configSite.innerHTML += opt;
                if (compSiteA) compSiteA.innerHTML += opt;
                if (compSiteB) compSiteB.innerHTML += opt;
                if (maintSiteSelect) maintSiteSelect.innerHTML += opt;
                if (monthlySite) monthlySite.innerHTML += opt;
                if (dailyToolSite) dailyToolSite.innerHTML += opt;
                if (rcaSiteSelect) rcaSiteSelect.innerHTML += opt;
            });
            
            // Restore values and trigger sync
            if (selectSite) {
                if (prevSelectSite) selectSite.value = prevSelectSite;
                updateMachineDropdown(selectSite, selectMachine, prevSelectMachine, "-- Choose Chamber --");
            }
            if (maintSiteSelect) {
                if (prevMaintSite) maintSiteSelect.value = prevMaintSite;
                updateMachineDropdown(maintSiteSelect, maintChamberSelect, prevMaintChamber, "-- Choose Machine --");
            }
            if (monthlySite) {
                if (prevMonthlySite) monthlySite.value = prevMonthlySite;
                updateMachineDropdown(monthlySite, monthlyMachine, prevMonthlyMachine, "All Machines");
            }
            if (dailyToolSite && prevDailyToolSite) {
                dailyToolSite.value = prevDailyToolSite;
            }
            if (rcaSiteSelect && prevRcaSite) {
                rcaSiteSelect.value = prevRcaSite;
            }
        })
        .catch(err => console.error("Error loading configurations:", err));
}

// Helper to update machine dropdown based on selected site
function updateMachineDropdown(siteSelectEl, machineSelectEl, selectedMachineVal = "", defaultOptionText = "-- Choose Chamber --") {
    if (!siteSelectEl || !machineSelectEl) return;
    const siteVal = siteSelectEl.value;
    if (!siteVal) {
        machineSelectEl.innerHTML = `<option value="">${defaultOptionText === "All Machines" ? "All Machines" : "-- Choose Site First --"}</option>`;
        return;
    }
    const siteId = parseInt(siteVal) || null;
    machineSelectEl.innerHTML = `<option value="">${defaultOptionText}</option>`;
    configData.machines.filter(m => m.site_id === siteId).forEach(m => {
        machineSelectEl.innerHTML += `<option value="${m.id}">${m.name} ${defaultOptionText.includes("Chamber") ? `(${m.process_type})` : ''}</option>`;
    });
    if (selectedMachineVal) {
        machineSelectEl.value = selectedMachineVal;
    }
}

// Helper to generate dynamic custom shift hour strings
function generateCustomHoursList(startHour, endHour) {
    const list = [];
    let current = startHour;
    while (current !== endHour) {
        const next = (current + 1) % 24;
        const currentStr = current.toString().padStart(2, '0') + ":00";
        const nextStr = next.toString().padStart(2, '0') + ":00";
        list.push(`${currentStr} - ${nextStr}`);
        current = next;
    }
    return list;
}

// 4. Excel spreadsheet data entry grid
function initDataEntryGrid() {
    const btnLoad = document.getElementById("btn-load-sheet");
    const placeholder = document.getElementById("sheet-placeholder");
    const container = document.getElementById("sheet-container");
    
    // Set default date picker value to today
    document.getElementById("input-date").value = new Date().toISOString().slice(0, 10);
    
    btnLoad.addEventListener("click", () => {
        const siteId = document.getElementById("select-site").value;
        const machineId = document.getElementById("select-machine").value;
        let shift = document.getElementById("select-shift").value;
        const date = document.getElementById("input-date").value;
        
        if (!siteId || !machineId || !shift || !date) {
            alert("Please complete the selector filters first.");
            return;
        }
        
        let customHours = null;
        if (shift === "Custom Shift") {
            const startHour = parseInt(document.getElementById("select-custom-start").value);
            const endHour = parseInt(document.getElementById("select-custom-end").value);
            if (startHour === endHour) {
                alert("Start Hour and End Hour cannot be the same.");
                return;
            }
            shift = `Custom (${startHour.toString().padStart(2, '0')}:00 - ${endHour.toString().padStart(2, '0')}:00)`;
            customHours = generateCustomHoursList(startHour, endHour);
        }
        
        btnLoad.disabled = true;
        btnLoad.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Loading...`;
        
        fetch(`${API_BASE}/api/records/load-or-create`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                site_id: parseInt(siteId), 
                machine_id: parseInt(machineId), 
                date, 
                shift,
                custom_hours: customHours
            })
        })
        .then(res => res.json())
        .then(data => {
            currentSheetHeader = data.record;
            currentSheetRows = data.rows;
            
            placeholder.classList.add("hidden");
            container.classList.remove("hidden");
            
            // Bind header metadata inputs
            document.getElementById("operator-name").value = currentSheetHeader.operator_name || "";
            document.getElementById("engineer-name").value = currentSheetHeader.engineer_name || "";
            document.getElementById("remarks-operator").value = currentSheetHeader.remarks_operator || "";
            document.getElementById("remarks-engineer").value = currentSheetHeader.remarks_engineer || "";
            document.getElementById("remarks-maintenance").value = currentSheetHeader.remarks_maintenance || "";
            
            // Update print-only header elements
            const site = configData.sites.find(s => s.id == currentSheetHeader.site_id)?.name || "Site";
            const machine = configData.machines.find(m => m.id == currentSheetHeader.machine_id)?.name || "Chamber";
            document.getElementById("print-site-val").textContent = site;
            document.getElementById("print-machine-val").textContent = machine;
            document.getElementById("print-shift-val").textContent = currentSheetHeader.shift || "";
            document.getElementById("print-date-val").textContent = currentSheetHeader.date || "";
            document.getElementById("print-operator-val").textContent = currentSheetHeader.operator_name || "";
            document.getElementById("print-engineer-val").textContent = currentSheetHeader.engineer_name || "";
            
            document.getElementById("print-remarks-operator-val").textContent = currentSheetHeader.remarks_operator || "No notes logged.";
            document.getElementById("print-remarks-engineer-val").textContent = currentSheetHeader.remarks_engineer || "No checks logged.";
            document.getElementById("print-remarks-maintenance-val").textContent = currentSheetHeader.remarks_maintenance || "No maintenance interventions logged.";
            
            // Build Table Cells HTML
            buildExcelGridRows();
            recalculateGridTotals();
        })
        .catch(err => {
            console.error(err);
            alert("Error loading sheet.");
        })
        .finally(() => {
            btnLoad.disabled = false;
            btnLoad.innerHTML = `<i class="fa-solid fa-cloud-arrow-down"></i> Open Sheet`;
        });
    });
    
    // PDF Print layout trigger
    document.getElementById("btn-export-pdf").addEventListener("click", () => {
        window.print();
    });

    // Excel and CSV Grid exports
    document.getElementById("btn-grid-export-excel").addEventListener("click", () => {
        exportSheetExcel(false);
    });
    document.getElementById("btn-grid-export-csv").addEventListener("click", () => {
        exportSheetExcel(true);
    });
    
    // Save metadata remarks manually
    document.getElementById("btn-save-metadata").addEventListener("click", () => {
        if (!currentSheetHeader) return;
        
        const saveBadge = document.getElementById("save-status");
        saveBadge.className = "save-badge saving";
        saveBadge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
        
        fetch(`${API_BASE}/api/records/save-metadata`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                record_id: currentSheetHeader.id,
                operator_name: document.getElementById("operator-name").value.trim(),
                engineer_name: document.getElementById("engineer-name").value.trim(),
                remarks_operator: document.getElementById("remarks-operator").value.trim(),
                remarks_engineer: document.getElementById("remarks-engineer").value.trim(),
                remarks_maintenance: document.getElementById("remarks-maintenance").value.trim()
            })
        })
        .then(res => res.json())
        .then(() => {
            saveBadge.className = "save-badge saved";
            saveBadge.innerHTML = `<i class="fa-solid fa-check-circle"></i> Saved`;
        })
        .catch(err => {
            console.error(err);
            saveBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Error`;
        });
    });

    // Sync operator and engineer inputs with print-only preview in real time
    document.getElementById("operator-name").addEventListener("input", (e) => {
        document.getElementById("print-operator-val").textContent = e.target.value.trim();
    });
    document.getElementById("engineer-name").addEventListener("input", (e) => {
        document.getElementById("print-engineer-val").textContent = e.target.value.trim();
    });
    document.getElementById("remarks-operator").addEventListener("input", (e) => {
        document.getElementById("print-remarks-operator-val").textContent = e.target.value.trim() || "No notes logged.";
    });
    document.getElementById("remarks-engineer").addEventListener("input", (e) => {
        document.getElementById("print-remarks-engineer-val").textContent = e.target.value.trim() || "No checks logged.";
    });
    document.getElementById("remarks-maintenance").addEventListener("input", (e) => {
        document.getElementById("print-remarks-maintenance-val").textContent = e.target.value.trim() || "No maintenance interventions logged.";
    });

    // Setup site dropdown dependency sync
    const selectSite = document.getElementById("select-site");
    const selectMachine = document.getElementById("select-machine");
    if (selectSite && selectMachine) {
        selectSite.addEventListener("change", () => {
            updateMachineDropdown(selectSite, selectMachine, "", "-- Choose Chamber --");
        });
    }

    // Toggle Custom Shift Timings selectors visibility based on selection
    const selectShift = document.getElementById("select-shift");
    const customTimeWrap = document.getElementById("custom-shift-time-wrap");
    if (selectShift && customTimeWrap) {
        selectShift.addEventListener("change", () => {
            if (selectShift.value === "Custom Shift") {
                customTimeWrap.classList.remove("hidden");
            } else {
                customTimeWrap.classList.add("hidden");
            }
        });
    }
}

function buildExcelGridRows() {
    const tbody = document.getElementById("grid-rows-body");
    tbody.innerHTML = "";
    
    currentSheetRows.forEach((row, rowIndex) => {
        const tr = document.createElement("tr");
        
        // Good Output Wafers writable or formula count fallback
        let good = row.good_count;
        if (good === undefined || good === null) {
            good = (row.total_input || 0) - (row.breakage_count || 0);
        }

        // Revised Rates: Computed based on OUTPUT, not input
        const brkPct = good > 0 ? ((row.breakage_count / good) * 100).toFixed(2) + "%" : "0.00%";
        const yieldPct = row.total_input > 0 ? ((good / row.total_input) * 100).toFixed(2) + "%" : "0.00%";
        
        const activeMachine = configData.machines.find(m => m.id == currentSheetHeader.machine_id);
        const processType = activeMachine ? activeMachine.process_type : "";
        let detailsHtml = `<td class="non-input text-secondary">-</td>`;
        
        let metaPrintStr = "";
        if (row.metadata) {
            try {
                const parsed = JSON.parse(row.metadata);
                if (Array.isArray(parsed)) {
                    metaPrintStr = parsed.map(b => `${b.id || '?'}(${b.breakage})`).join(", ");
                } else if (parsed) {
                    metaPrintStr = Object.keys(parsed).map(k => `${k}: ${parsed[k].input}/${parsed[k].breakage}`).join(" | ");
                }
            } catch(e) {}
        }
        
        if (["Diffusion", "Annealing", "Poly PECVD", "Front PECVD", "Rear PECVD"].includes(processType)) {
            detailsHtml = `<td>
                <button class="secondary-btn btn-manage-boats screen-only" data-row-idx="${rowIndex}" style="padding: 4px 8px; font-size: 11px;"><i class="fa-solid fa-anchor"></i> Boats</button>
                <span class="print-only font-mono" style="font-size: 10px;">${metaPrintStr || '-'}</span>
            </td>`;
        } else if (processType === "BSG") {
            detailsHtml = `<td>
                <button class="secondary-btn btn-manage-tracks screen-only" data-row-idx="${rowIndex}" style="padding: 4px 8px; font-size: 11px;"><i class="fa-solid fa-table-cells"></i> Tracks</button>
                <span class="print-only font-mono" style="font-size: 10px;">${metaPrintStr || '-'}</span>
            </td>`;
        }
        
        tr.innerHTML = `
            <td class="non-input font-bold text-secondary">${row.hour_label}</td>
            ${detailsHtml}
            <td>
                <input type="number" value="${row.total_input || 0}" data-row-idx="${rowIndex}" data-field="total_input" class="grid-cell">
            </td>
            <td>
                <input type="number" value="${row.breakage_count || 0}" data-row-idx="${rowIndex}" data-field="breakage_count" class="grid-cell text-red">
            </td>
            <td>
                <input type="number" value="${good}" data-row-idx="${rowIndex}" data-field="good_count" class="grid-cell font-bold text-cyan text-right">
            </td>
            <td id="brk-pct-${rowIndex}" class="non-input text-red text-right font-bold">${brkPct}</td>
            <td>
                <input type="number" value="${row.downtime_minutes || 0}" data-row-idx="${rowIndex}" data-field="downtime_minutes" class="grid-cell">
            </td>
            <td>
                <input type="text" value="${row.downtime_reason || ''}" data-row-idx="${rowIndex}" data-field="downtime_reason" placeholder="Downtime reasons / remarks" class="grid-cell text-left screen-only">
                <span class="print-only text-left font-mono" style="font-size: 10px; white-space: normal; word-break: break-word;">${row.downtime_reason || ''}</span>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
    
    setupGridListeners();
}

function setupGridListeners() {
    const inputs = document.querySelectorAll(".grid-cell");
    
    inputs.forEach(input => {
        input.addEventListener("input", (e) => {
            const rowIdx = parseInt(e.target.getAttribute("data-row-idx"));
            const field = e.target.getAttribute("data-field");
            const val = field === "downtime_reason" ? e.target.value : parseInt(e.target.value) || 0;
            
            currentSheetRows[rowIdx][field] = val;
            
            // Auto-compute good_count when total_input or breakage_count changes
            if (field === "total_input" || field === "breakage_count") {
                const rObj = currentSheetRows[rowIdx];
                rObj.good_count = (rObj.total_input || 0) - (rObj.breakage_count || 0);
                const goodInput = document.querySelector(`.grid-cell[data-row-idx="${rowIdx}"][data-field="good_count"]`);
                if (goodInput) {
                    goodInput.value = rObj.good_count;
                }
            }

            // Recompute row fields formulas in DOM (based on GOOD OUTPUT)
            const row = currentSheetRows[rowIdx];
            let good = row.good_count;
            if (good === undefined || good === null) {
                good = (row.total_input || 0) - (row.breakage_count || 0);
            }
            const brkPct = good > 0 ? ((row.breakage_count / good) * 100).toFixed(2) + "%" : "0.00%";
            const yieldPct = row.total_input > 0 ? ((good / row.total_input) * 100).toFixed(2) + "%" : "0.00%";

            document.getElementById(`brk-pct-${rowIdx}`).textContent = brkPct;
            const yieldPctEl = document.getElementById(`yield-pct-${rowIdx}`);
            if (yieldPctEl) yieldPctEl.textContent = yieldPct;
            
            // Sync print span for remarks/downtime reason
            if (field === "downtime_reason") {
                const cell = e.target.parentElement;
                const span = cell.querySelector('.print-only');
                if (span) {
                    span.textContent = e.target.value;
                }
            }
            
            recalculateGridTotals();
            triggerDebouncedSave(rowIdx);
        });
        
        input.addEventListener("keydown", (e) => {
            const rowIdx = parseInt(e.target.getAttribute("data-row-idx"));
            const field = e.target.getAttribute("data-field");
            const totalRows = currentSheetRows.length;
            
            const cols = ["total_input", "breakage_count", "good_count", "downtime_minutes", "downtime_reason"];
            const colIdx = cols.indexOf(field);
            
            let nextRowIdx = rowIdx;
            let nextColIdx = colIdx;
            
            if (e.key === "ArrowUp") {
                nextRowIdx = Math.max(0, rowIdx - 1);
                e.preventDefault();
            } else if (e.key === "ArrowDown" || e.key === "Enter") {
                nextRowIdx = Math.min(totalRows - 1, rowIdx + 1);
                e.preventDefault();
            } else if (e.key === "ArrowLeft") {
                if (e.target.type === "number" || e.target.selectionStart === 0) {
                    nextColIdx = Math.max(0, colIdx - 1);
                }
            } else if (e.key === "ArrowRight") {
                if (e.target.type === "number" || e.target.selectionEnd === e.target.value.length) {
                    nextColIdx = Math.min(cols.length - 1, colIdx + 1);
                }
            } else if (e.key === "Tab") {
                if (e.shiftKey) {
                    if (colIdx === 0 && rowIdx > 0) {
                        nextRowIdx = rowIdx - 1;
                        nextColIdx = cols.length - 1;
                        e.preventDefault();
                    }
                } else {
                    if (colIdx === cols.length - 1 && rowIdx < totalRows - 1) {
                        nextRowIdx = rowIdx + 1;
                        nextColIdx = 0;
                        e.preventDefault();
                    }
                }
            } else {
                return;
            }
            
            const targetEl = document.querySelector(`.grid-cell[data-row-idx="${nextRowIdx}"][data-field="${cols[nextColIdx]}"]`);
            if (targetEl) {
                targetEl.focus();
                if (targetEl.type === "text") {
                    targetEl.select();
                }
            }
        });
    });
    
    // Wire Boats popups
    document.querySelectorAll(".btn-manage-boats").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const rowIdx = parseInt(e.target.closest(".btn-manage-boats").getAttribute("data-row-idx"));
            openBoatsModal(rowIdx);
        });
    });
    
    // Wire Tracks popups
    document.querySelectorAll(".btn-manage-tracks").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const rowIdx = parseInt(e.target.closest(".btn-manage-tracks").getAttribute("data-row-idx"));
            openTracksModal(rowIdx);
        });
    });
}

function recalculateGridTotals() {
    let totIn = 0;
    let totBr = 0;
    let totGood = 0;
    let totDt = 0;
    
    currentSheetRows.forEach(row => {
        totIn += row.total_input || 0;
        totBr += row.breakage_count || 0;
        let good = row.good_count;
        if (good === undefined || good === null) {
            good = (row.total_input || 0) - (row.breakage_count || 0);
        }
        totGood += good;
        totDt += row.downtime_minutes || 0;
    });
    
    const brkPct = totGood > 0 ? ((totBr / totGood) * 100).toFixed(2) + "%" : "0.00%";
    const yieldPct = totIn > 0 ? ((totGood / totIn) * 100).toFixed(2) + "%" : "0.00%";
    
    document.getElementById("total-input").textContent = totIn.toLocaleString();
    document.getElementById("total-breakage").textContent = totBr.toLocaleString();
    document.getElementById("total-good").textContent = totGood.toLocaleString();
    document.getElementById("total-downtime").textContent = totDt.toLocaleString();
    
    document.getElementById("avg-breakage-pct").textContent = brkPct;
    const avgYieldPctEl = document.getElementById("avg-yield-pct");
    if (avgYieldPctEl) avgYieldPctEl.textContent = yieldPct;
}

function triggerDebouncedSave(rowIdx) {
    const saveBadge = document.getElementById("save-status");
    saveBadge.className = "save-badge saving";
    saveBadge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
    
    if (saveTimeout) clearTimeout(saveTimeout);
    
    saveTimeout = setTimeout(() => {
        const row = currentSheetRows[rowIdx];
        fetch(`${API_BASE}/api/records/save-row`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                record_id: currentSheetHeader.id,
                row_id: row.id,
                total_input: row.total_input,
                breakage_count: row.breakage_count,
                rejection_count: 0,
                good_count: row.good_count !== undefined && row.good_count !== null ? row.good_count : ((row.total_input || 0) - (row.breakage_count || 0)),
                downtime_minutes: row.downtime_minutes,
                downtime_reason: row.downtime_reason || "",
                remarks: row.remarks || "",
                metadata: row.metadata || null
            })
        })
        .then(res => res.json())
        .then(data => {
            currentSheetHeader = data.record;
            saveBadge.className = "save-badge saved";
            saveBadge.innerHTML = `<i class="fa-solid fa-check-circle"></i> Saved`;
        })
        .catch(err => {
            console.error("Auto save failed:", err);
            saveBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Error`;
        });
    }, 1500); // 1.5 seconds debounce
}

// 5. Excel Table Compiler
function exportSheetExcel(asCSV = false) {
    if (!currentSheetHeader) return;
    
    const site = configData.sites.find(s => s.id == currentSheetHeader.site_id)?.name || "Site";
    const machine = configData.machines.find(m => m.id == currentSheetHeader.machine_id)?.name || "Chamber";
    
    let content = "";
    let filename = "";
    
    let totIn = 0;
    let totBr = 0;
    let totGood = 0;
    let totDt = 0;
    currentSheetRows.forEach(row => {
        totIn += row.total_input || 0;
        totBr += row.breakage_count || 0;
        let good = row.good_count;
        if (good === undefined || good === null) {
            good = (row.total_input || 0) - (row.breakage_count || 0);
        }
        totGood += good;
        totDt += row.downtime_minutes || 0;
    });
    const brkPctTotal = totGood > 0 ? ((totBr / totGood) * 100).toFixed(2) : "0.00";
    
    const operator = document.getElementById("operator-name")?.value.trim() || currentSheetHeader.operator_name || "";
    const engineer = document.getElementById("engineer-name")?.value.trim() || currentSheetHeader.engineer_name || "";

    const formatMetadataForColumn = (row) => {
        if (!row.metadata) return "-";
        try {
            const parsed = JSON.parse(row.metadata);
            if (Array.isArray(parsed)) {
                return parsed.map(b => `${b.id || '?'}(${b.breakage})`).join(", ");
            } else if (parsed && typeof parsed === "object") {
                return Object.keys(parsed).map(k => `${k}: ${parsed[k].input}/${parsed[k].breakage}`).join(" | ");
            }
        } catch(e) {}
        return "-";
    };

    if (asCSV) {
        filename = `nmtronics_${site.split(" ")[0]}_${currentSheetHeader.shift.replace(" ","")}_${currentSheetHeader.date}.csv`;
        
        content += `"NMTronics Solar Cell Production Sheet"\n`;
        content += `"Customer Site:","${site}"\n`;
        content += `"Machine Name:","${machine}"\n`;
        content += `"Shift Group:","${currentSheetHeader.shift}"\n`;
        content += `"Operation Date:","${currentSheetHeader.date}"\n`;
        content += `"Production Person Name:","${operator}"\n`;
        content += `"NMT Engineer Name:","${engineer}"\n\n`;
        
        content += "Hour,Process Details,Total Input,Breakage,Total Output (Good),Breakage % (on Output),Downtime (Mins),Remarks\n";
        
        currentSheetRows.forEach(r => {
            let good = r.good_count;
            if (good === undefined || good === null) {
                good = (r.total_input || 0) - (r.breakage_count || 0);
            }
            const brkPct = good > 0 ? ((r.breakage_count / good) * 100).toFixed(2) : "0.00";
            const details = formatMetadataForColumn(r);
            content += `${r.hour_label},"${details}",${r.total_input},${r.breakage_count},${good},${brkPct}%,${r.downtime_minutes},"${r.downtime_reason || ''}"\n`;
        });
        
        content += `TOTALS,-,${totIn},${totBr},${totGood},${brkPctTotal}%,${totDt},""\n`;
    } else {
        filename = `nmtronics_${site.split(" ")[0]}_${currentSheetHeader.shift.replace(" ","")}_${currentSheetHeader.date}.xls`;
        
        const title = "NMTronics Solar Cell Production Sheet";
        const metadata = [
            { label: "Customer Site", value: site },
            { label: "Machine Name", value: machine },
            { label: "Shift Group", value: currentSheetHeader.shift },
            { label: "Operation Date", value: currentSheetHeader.date },
            { label: "Production Person Name", value: operator },
            { label: "NMT Engineer Name", value: engineer }
        ];
        const headers = [
            { label: "Hour", align: "left" },
            { label: "Process Details (Boats/Tracks)", align: "left" },
            { label: "Total Input", align: "right" },
            { label: "Breakage", align: "right", type: "red" },
            { label: "Total Output (Good)", align: "right", type: "cyan" },
            { label: "Breakage % (on Output)", align: "right", type: "red" },
            { label: "Downtime (Mins)", align: "right" },
            { label: "Remarks", align: "left" }
        ];
        const rows = currentSheetRows.map(r => {
            let good = r.good_count;
            if (good === undefined || good === null) {
                good = (r.total_input || 0) - (r.breakage_count || 0);
            }
            const brkPct = good > 0 ? ((r.breakage_count / good) * 100).toFixed(2) + "%" : "0.00%";
            const details = formatMetadataForColumn(r);
            return [
                r.hour_label,
                details,
                r.total_input,
                r.breakage_count,
                good,
                brkPct,
                r.downtime_minutes,
                r.downtime_reason || ''
            ];
        });
        const footerRows = [
            [
                "TOTALS",
                "-",
                totIn,
                totBr,
                totGood,
                brkPctTotal + "%",
                totDt,
                ""
            ]
        ];
        content = compileExcelHtml(title, metadata, headers, rows, footerRows);
    }
    
    const blob = new Blob([content], { type: asCSV ? 'text/csv;charset=utf-8;' : 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 6. Site Comparison Panel
function initSiteComparison() {
    const btnCompare = document.getElementById("btn-run-comparison");
    document.getElementById("compare-date").value = new Date().toISOString().slice(0, 10);
    
    btnCompare.addEventListener("click", () => {
        const siteAId = document.getElementById("compare-site-a").value;
        const siteBId = document.getElementById("compare-site-b").value;
        const date = document.getElementById("compare-date").value;
        const tbody = document.getElementById("comparison-table-body");
        
        if (!siteAId || !siteBId || !date) {
            alert("Select Site A, Site B, and Date first.");
            return;
        }
        
        const siteAName = configData.sites.find(s => s.id == siteAId)?.name || "Site A";
        const siteBName = configData.sites.find(s => s.id == siteBId)?.name || "Site B";
        
        document.getElementById("compare-site-a-header").textContent = siteAName;
        document.getElementById("compare-site-b-header").textContent = siteBName;
        
        tbody.innerHTML = `<tr><td colspan="4" class="text-secondary" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Analyzing Facilities Data...</td></tr>`;
        
        fetch(`${API_BASE}/api/records/history?date_str=${date}`)
            .then(res => res.json())
            .then(data => {
                const sheetsA = data.filter(r => r.site_id == siteAId);
                const sheetsB = data.filter(r => r.site_id == siteBId);
                
                const statsA = compileSheetsTotals(sheetsA);
                const statsB = compileSheetsTotals(sheetsB);
                
                const varIn = statsA.prod - statsB.prod;
                const varOut = statsA.good - statsB.good;
                const varBrk = statsA.break - statsB.break;
                
                const varBrkPct = (statsA.brkPct - statsB.brkPct).toFixed(2) + "%";
                const varYield = (statsA.yield - statsB.yield).toFixed(2) + "%";
                
                tbody.innerHTML = `
                    <tr>
                        <td class="font-bold">Total Wafers Input (Qty)</td>
                        <td class="text-right">${statsA.prod.toLocaleString()}</td>
                        <td class="text-right">${statsB.prod.toLocaleString()}</td>
                        <td class="text-right font-bold ${varIn >= 0 ? 'text-green' : 'text-red'}">${varIn >= 0 ? '+' : ''}${varIn.toLocaleString()}</td>
                    </tr>
                    <tr>
                        <td class="font-bold">Total Wafers Output (Good)</td>
                        <td class="text-right text-cyan font-bold">${statsA.good.toLocaleString()}</td>
                        <td class="text-right text-cyan font-bold">${statsB.good.toLocaleString()}</td>
                        <td class="text-right font-bold ${varOut >= 0 ? 'text-green' : 'text-red'}">${varOut >= 0 ? '+' : ''}${varOut.toLocaleString()}</td>
                    </tr>
                    <tr>
                        <td class="font-bold">Scrap Wafers Breakage (Qty)</td>
                        <td class="text-right text-red">${statsA.break.toLocaleString()}</td>
                        <td class="text-right text-red">${statsB.break.toLocaleString()}</td>
                        <td class="text-right font-bold ${varBrk <= 0 ? 'text-green' : 'text-red'}">${varBrk >= 0 ? '+' : ''}${varBrk.toLocaleString()}</td>
                    </tr>
                    <tr>
                        <td class="font-bold">Breakage Rate (%) (on Output)</td>
                        <td class="text-right text-red font-bold">${statsA.brkPct.toFixed(2)}%</td>
                        <td class="text-right text-red font-bold">${statsB.brkPct.toFixed(2)}%</td>
                        <td class="text-right font-bold ${statsA.brkPct <= statsB.brkPct ? 'text-green' : 'text-red'}">${varBrkPct}</td>
                    </tr>
                    <tr>
                        <td class="font-bold text-green">Process Yield Rate (%) (on Input)</td>
                        <td class="text-right text-green font-bold">${statsA.yield.toFixed(2)}%</td>
                        <td class="text-right text-green font-bold">${statsB.yield.toFixed(2)}%</td>
                        <td class="text-right font-bold ${statsA.yield >= statsB.yield ? 'text-green' : 'text-red'}">${statsA.yield >= statsB.yield ? '+' : ''}${varYield}</td>
                    </tr>
                `;
            })
            .catch(err => {
                console.error(err);
                tbody.innerHTML = `<tr><td colspan="4" class="text-red" style="text-align: center;">Error performing comparison.</td></tr>`;
            });
    });
}

function compileSheetsTotals(sheets) {
    let prod = 0;
    let good = 0;
    let breakCount = 0;
    
    sheets.forEach(s => {
        prod += s.total_production || 0;
        good += s.good_wafers || 0;
        breakCount += s.broken_wafers || 0;
    });
    
    const brkPct = good > 0 ? (breakCount / good) * 100 : 0;
    const yieldPct = prod > 0 ? (good / prod) * 100 : 0;
    
    return { prod, good, break: breakCount, brkPct, yield: yieldPct };
}

// 7. Sheets History searching & Excel report exporter
function initReportsSearch() {
    const btnSearch = document.getElementById("btn-search-history");
    const btnExportCSV = document.getElementById("btn-export-csv");
    const btnExportExcel = document.getElementById("btn-export-excel");
    
    btnSearch.addEventListener("click", () => {
        loadHistoryTable();
    });
    
    btnExportCSV.addEventListener("click", () => {
        exportHistoryList(true);
    });
    
    btnExportExcel.addEventListener("click", () => {
        exportHistoryList(false);
    });
}

function loadHistoryTable() {
    const siteId = document.getElementById("history-site").value;
    const date = document.getElementById("history-date").value;
    const tbody = document.getElementById("history-table-body");
    
    tbody.innerHTML = `<tr><td colspan="11" class="text-secondary" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Querying Database...</td></tr>`;
    
    let url = `${API_BASE}/api/records/history`;
    const params = [];
    if (siteId) params.push(`site_id=${siteId}`);
    if (date) params.push(`date_str=${date}`);
    if (params.length > 0) url += "?" + params.join("&");
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            tbody.innerHTML = "";
            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="11" class="text-secondary" style="text-align: center;">No records found.</td></tr>`;
                return;
            }
            
            data.forEach(r => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${r.date}</td>
                    <td>${r.shift}</td>
                    <td class="font-bold">${r.site_name}</td>
                    <td class="text-secondary">${r.machine_name}</td>
                    <td class="text-right">${r.total_production.toLocaleString()}</td>
                    <td class="text-right text-cyan font-bold">${r.good_wafers.toLocaleString()}</td>
                    <td class="text-right text-red font-bold">${r.breakage_percentage}%</td>
                    <td class="text-right text-green font-bold">${r.yield_percentage}%</td>
                    <td class="text-right">${r.total_production > 0 ? 0 : 0}</td>
                    <td>
                        <button class="primary-btn btn-view-sheet" data-site="${r.site_id}" data-mach="${r.machine_id}" data-date="${r.date}" data-shift="${r.shift}" style="padding: 4px 10px; font-size:10px;">
                            <i class="fa-solid fa-folder-open"></i> Load
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            
            // Wire load buttons
            document.querySelectorAll(".btn-view-sheet").forEach(btn => {
                btn.addEventListener("click", (e) => {
                    const el = e.target.closest(".btn-view-sheet");
                    document.getElementById("select-site").value = el.getAttribute("data-site");
                    
                    const selectSiteEl = document.getElementById("select-site");
                    const event = new Event('change');
                    selectSiteEl.dispatchEvent(event);
                    
                    setTimeout(() => {
                        document.getElementById("select-machine").value = el.getAttribute("data-mach");
                        document.getElementById("select-shift").value = el.getAttribute("data-shift");
                        document.getElementById("input-date").value = el.getAttribute("data-date");
                        
              // Default open homepage on application start
    document.querySelector('.nav-btn[data-target="home-view"]').click();
                        document.getElementById("btn-load-sheet").click();
                    }, 100);
                });
            });
        })
        .catch(err => {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="11" class="text-red" style="text-align: center;">Error querying database.</td></tr>`;
        });
}

function exportHistoryList(asCSV = false) {
    const siteId = document.getElementById("history-site").value;
    const date = document.getElementById("history-date").value;
    
    let url = `${API_BASE}/api/records/history`;
    const params = [];
    if (siteId) params.push(`site_id=${siteId}`);
    if (date) params.push(`date_str=${date}`);
    if (params.length > 0) url += "?" + params.join("&");
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data.length === 0) {
                alert("No history logs available to export.");
                return;
            }
            
            let content = "";
            let filename = `nmtronics_history_export_${new Date().toISOString().slice(0,10)}`;
            
            if (asCSV) {
                filename += ".csv";
                content = `"NMTronics Production History Log"\n`;
                content += `"Exported on:","${new Date().toLocaleString()}"\n\n`;
                content += "Date,Shift,Site,Machine,Total Input,Good Output,Breakage %,Yield %\n";
                data.forEach(r => {
                    content += `${r.date},${r.shift},"${r.site_name}","${r.machine_name}",${r.total_production},${r.good_wafers},${r.breakage_percentage}%,${r.yield_percentage}%\n`;
                });
            } else {
                filename += ".xls";
                content = `NMTronics Production History Log\n`;
                content += `Exported on:\t${new Date().toLocaleString()}\n\n`;
                content += "Date\tShift\tSite\tMachine\tTotal Input\tGood Output\tBreakage %\tYield %\n";
                data.forEach(r => {
                    content += `${r.date}\t${r.shift}\t${r.site_name}\t${r.machine_name}\t${r.total_production}\t${r.good_wafers}\t${r.breakage_percentage}%\t${r.yield_percentage}%\n`;
                });
            }
            
            const blob = new Blob([content], { type: asCSV ? 'text/csv;charset=utf-8;' : 'application/vnd.ms-excel;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.setAttribute("download", filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        })
        .catch(err => console.error("Export error:", err));
}

// 8. Maintenance Comments Hub (NMT Team Logs)
function initMaintenancePortal() {
    const maintForm = document.getElementById("maintenance-form");
    
    maintForm.addEventListener("submit", (e) => {
        e.preventDefault();
        
        const siteId = document.getElementById("maint-site-select").value;
        const machineId = document.getElementById("maint-chamber-select").value;
        const comment = document.getElementById("maint-desc-input").value.trim();
        const loggedBy = document.getElementById("maint-name-input").value.trim();
        
        if (!siteId || !machineId || !comment || !loggedBy) {
            alert("Please complete all maintenance fields.");
            return;
        }
        
        fetch(`${API_BASE}/api/maintenance/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                site_id: parseInt(siteId),
                machine_id: parseInt(machineId),
                comment,
                logged_by: loggedBy
            })
        })
        .then(res => res.json())
        .then(() => {
            alert("NMT Maintenance comment logged successfully.");
            maintForm.reset();
            loadConfigData(); // Reset dropdowns
            loadMaintenanceComments(); // Reload history logs list
        })
        .catch(err => {
            console.error(err);
            alert("Failed to log maintenance comment.");
        });
    });

    // Setup maintenance site dropdown dependency sync
    const maintSiteSelect = document.getElementById("maint-site-select");
    const maintChamberSelect = document.getElementById("maint-chamber-select");
    if (maintSiteSelect && maintChamberSelect) {
        maintSiteSelect.addEventListener("change", () => {
            updateMachineDropdown(maintSiteSelect, maintChamberSelect, "", "-- Choose Machine --");
        });
    }
}

function loadMaintenanceComments() {
    const logList = document.getElementById("comments-log-list");
    logList.innerHTML = `<div class="text-secondary" style="text-align: center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> Fetching Comments Logs...</div>`;
    
    fetch(`${API_BASE}/api/maintenance/comments`)
        .then(res => res.json())
        .then(data => {
            logList.innerHTML = "";
            if (data.length === 0) {
                logList.innerHTML = `<div class="text-secondary" style="text-align: center; padding: 20px; font-size:12px;">No logged remarks found.</div>`;
                return;
            }
            
            data.forEach(c => {
                const card = document.createElement("div");
                card.className = "maintenance-comment-card";
                
                // Format Date
                const dateClean = c.logged_at ? c.logged_at.slice(0, 16) : "";
                
                card.innerHTML = `
                    <div class="comment-meta">
                        <div class="comment-meta-left">
                            <span class="comment-badge">${c.site_name.split(" ")[0]}</span>
                            <span class="comment-badge" style="background: rgba(0, 255, 136, 0.08); color: var(--primary-green);">${c.machine_name.replace(c.site_name.split(" ")[0] + " - ", "")}</span>
                        </div>
                        <div>${dateClean}</div>
                    </div>
                    <div class="comment-text">${c.comment}</div>
                    <div class="comment-author">
                        <i class="fa-solid fa-user-gear" style="color: var(--primary-cyan); font-size: 11px;"></i>
                        <span>Tech: <b>${c.logged_by}</b></span>
                    </div>
                `;
                logList.appendChild(card);
            });
        })
        .catch(err => {
            console.error(err);
            logList.innerHTML = `<div class="text-red" style="text-align: center; padding: 20px;">Error loading comments logs.</div>`;
        });
}

// 9. Settings Configuration forms
function initConfigurationPanel() {
    const siteForm = document.getElementById("form-add-site");
    const machForm = document.getElementById("form-add-machine");
    
    siteForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = document.getElementById("site-name-input").value.trim();
        const location = document.getElementById("site-location-input").value.trim();
        
        fetch(`${API_BASE}/api/sites`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, location })
        })
        .then(res => res.json())
        .then(() => {
            alert("Customer site registered successfully.");
            siteForm.reset();
            loadConfigData();
        })
        .catch(err => {
            console.error(err);
            alert("Failed to add site.");
        });
    });
    
    machForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const siteId = document.getElementById("machine-site-select").value;
        const name = document.getElementById("machine-name-input").value.trim();
        const process = document.getElementById("machine-process-select").value;
        
        fetch(`${API_BASE}/api/machines`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, process_type: process, site_id: parseInt(siteId) })
        })
        .then(res => res.json())
        .then(() => {
            alert("Machine registered successfully to site database.");
            machForm.reset();
            loadConfigData();
        })
        .catch(err => {
            console.error(err);
            alert("Failed to link machine.");
        });
    });
}

// 10. Monthly Summary Reports Engine (Renamed to Date Range Report)
let currentMonthlyRows = [];

function initMonthlySummary() {
    const btnLoad = document.getElementById("btn-load-monthly");
    const placeholder = document.getElementById("monthly-placeholder");
    const container = document.getElementById("monthly-report-container");
    
    // Set default date range picker values: start date (7 days ago) and end date (today)
    const startDatePicker = document.getElementById("input-start-date");
    const endDatePicker = document.getElementById("input-end-date");
    
    if (startDatePicker && endDatePicker) {
        const today = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 7);
        
        startDatePicker.value = sevenDaysAgo.toISOString().slice(0, 10);
        endDatePicker.value = today.toISOString().slice(0, 10);
    }
    
    if (btnLoad) {
        btnLoad.addEventListener("click", () => {
            const siteId = document.getElementById("monthly-site").value;
            const machineId = document.getElementById("monthly-machine").value;
            const shift = document.getElementById("monthly-shift").value;
            const startDate = document.getElementById("input-start-date").value;
            const endDate = document.getElementById("input-end-date").value;
            
            if (!siteId || !startDate || !endDate) {
                alert("Please select a Customer Site, Start Date, and End Date first.");
                return;
            }
            
            btnLoad.disabled = true;
            btnLoad.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Generating...`;
            
            let url = `${API_BASE}/api/records/history?site_id=${siteId}&start_date=${startDate}&end_date=${endDate}`;
            if (machineId) {
                url += `&machine_id=${machineId}`;
            }
            
            fetch(url)
                .then(res => res.json())
                .then(data => {
                    // Filter by shift group on client side if shift is selected
                    if (shift) {
                        data = data.filter(r => r.shift === shift);
                    }
                    
                    currentMonthlyRows = data;
                    
                    if (data.length === 0) {
                        placeholder.classList.remove("hidden");
                        container.classList.add("hidden");
                        alert("No production records found for the selected criteria.");
                        return;
                    }
                    
                    placeholder.classList.add("hidden");
                    container.classList.remove("hidden");
                    
                    // Update title
                    const siteName = configData.sites.find(s => s.id == siteId)?.name || "Site";
                    const machineText = machineId ? (configData.machines.find(m => m.id == machineId)?.name || "Machine") : "All Machines";
                    const shiftText = shift || "All Shifts";
                    
                    document.getElementById("monthly-report-title").textContent = 
                        `${siteName} - ${machineText} - ${shiftText} (${startDate} to ${endDate})`;
                    
                    buildMonthlyGridRows();
                })
                .catch(err => {
                    console.error(err);
                    alert("Error loading production report.");
                })
                .finally(() => {
                    btnLoad.disabled = false;
                    btnLoad.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Generate Report`;
                });
        });
    }
    
    // PDF Print layout trigger
    const btnPrint = document.getElementById("btn-monthly-print-pdf");
    if (btnPrint) {
        btnPrint.addEventListener("click", () => {
            window.print();
        });
    }

    // Excel and CSV Grid exports
    const btnExportExcel = document.getElementById("btn-monthly-export-excel");
    if (btnExportExcel) {
        btnExportExcel.addEventListener("click", () => {
            exportMonthlyExcel(false);
        });
    }
    
    const btnExportCSV = document.getElementById("btn-monthly-export-csv");
    if (btnExportCSV) {
        btnExportCSV.addEventListener("click", () => {
            exportMonthlyExcel(true);
        });
    }

    // Setup monthly summary site dropdown dependency sync
    const monthlySite = document.getElementById("monthly-site");
    const monthlyMachine = document.getElementById("monthly-machine");
    if (monthlySite && monthlyMachine) {
        monthlySite.addEventListener("change", () => {
            updateMachineDropdown(monthlySite, monthlyMachine, "", "All Machines");
        });
    }
}

function buildMonthlyGridRows() {
    const tbody = document.getElementById("monthly-rows-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    
    let totalInput = 0;
    let totalBreakage = 0;
    let totalGood = 0;
    
    currentMonthlyRows.forEach(r => {
        const tr = document.createElement("tr");
        
        totalInput += r.total_production || 0;
        totalBreakage += r.broken_wafers || 0;
        totalGood += r.good_wafers || 0;
        
        tr.innerHTML = `
            <td>${r.date}</td>
            <td class="font-bold">${r.site_name}</td>
            <td class="text-secondary">${r.machine_name}</td>
            <td>${r.shift}</td>
            <td class="text-right">${(r.total_production || 0).toLocaleString()}</td>
            <td class="text-right text-red">${(r.broken_wafers || 0).toLocaleString()}</td>
            <td class="text-right text-cyan font-bold">${(r.good_wafers || 0).toLocaleString()}</td>
            <td class="text-right text-red font-bold">${r.breakage_percentage}%</td>
            <td class="text-right text-green font-bold">${r.yield_percentage}%</td>
        `;
        
        tbody.appendChild(tr);
    });
    
    // Aggregate Rates (calculated on aggregated Good Output)
    const brkPctTotal = totalGood > 0 ? ((totalBreakage / totalGood) * 100).toFixed(2) + "%" : "0.00%";
    const yieldPctTotal = totalInput > 0 ? ((totalGood / totalInput) * 100).toFixed(2) + "%" : "0.00%";
    
    document.getElementById("monthly-total-input").textContent = totalInput.toLocaleString();
    document.getElementById("monthly-total-breakage").textContent = totalBreakage.toLocaleString();
    document.getElementById("monthly-total-good").textContent = totalGood.toLocaleString();
    
    document.getElementById("monthly-avg-breakage-pct").textContent = brkPctTotal;
    document.getElementById("monthly-avg-yield-pct").textContent = yieldPctTotal;
}

function exportMonthlyExcel(asCSV = false) {
    if (currentMonthlyRows.length === 0) return;
    
    const siteId = document.getElementById("monthly-site").value;
    const machineId = document.getElementById("monthly-machine").value;
    const shift = document.getElementById("monthly-shift").value;
    const startDate = document.getElementById("input-start-date").value;
    const endDate = document.getElementById("input-end-date").value;
    
    const siteName = configData.sites.find(s => s.id == siteId)?.name || "Site";
    const machineText = machineId ? (configData.machines.find(m => m.id == machineId)?.name || "Machine") : "All Machines";
    const shiftText = shift || "All Shifts";
    
    let content = "";
    let filename = "";
    
    let totalInput = 0;
    let totalBreakage = 0;
    let totalGood = 0;
    
    currentMonthlyRows.forEach(r => {
        totalInput += r.total_production || 0;
        totalBreakage += r.broken_wafers || 0;
        totalGood += r.good_wafers || 0;
    });
    
    const brkPctTotal = totalGood > 0 ? ((totalBreakage / totalGood) * 100).toFixed(2) : "0.00";
    const yieldPctTotal = totalInput > 0 ? ((totalGood / totalInput) * 100).toFixed(2) : "0.00";

    if (asCSV) {
        filename = `nmtronics_report_${siteName.split(" ")[0]}_${startDate}_to_${endDate}.csv`;
        
        content += `"NMTronics Solar Cell Production Date Range Report"\n`;
        content += `"Customer Site:","${siteName}"\n`;
        content += `"Machine/Process:","${machineText}"\n`;
        content += `"Shift Group:","${shiftText}"\n`;
        content += `"Report Period:","${startDate} to ${endDate}"\n`;
        content += `"Exported on:","${new Date().toLocaleString()}"\n\n`;
        
        content += "Date,Site,Machine,Shift,Total Input,Breakage,Total Output (Good),Breakage % (on Output),Yield %\n";
        
        currentMonthlyRows.forEach(r => {
            content += `${r.date},"${r.site_name}","${r.machine_name}",${r.shift},${r.total_production},${r.broken_wafers},${r.good_wafers},${r.breakage_percentage}%,${r.yield_percentage}%\n`;
        });
        
        content += `TOTALS,,,,${totalInput},${totalBreakage},${totalGood},${brkPctTotal}%,${yieldPctTotal}%\n`;
    } else {
        filename = `nmtronics_report_${siteName.split(" ")[0]}_${startDate}_to_${endDate}.xls`;
        
        const title = "NMTronics Solar Cell Production Date Range Report";
        const metadata = [
            { label: "Customer Site", value: siteName },
            { label: "Machine/Process", value: machineText },
            { label: "Shift Group", value: shiftText },
            { label: "Report Period", value: `${startDate} to ${endDate}` },
            { label: "Exported on", value: new Date().toLocaleString() }
        ];
        const headers = [
            { label: "Date", align: "left" },
            { label: "Site", align: "left" },
            { label: "Machine", align: "left" },
            { label: "Shift", align: "left" },
            { label: "Total Input", align: "right" },
            { label: "Breakage", align: "right", type: "red" },
            { label: "Total Output (Good)", align: "right", type: "cyan" },
            { label: "Breakage % (on Output)", align: "right", type: "red" },
            { label: "Yield %", align: "right", type: "green" }
        ];
        const rows = currentMonthlyRows.map(r => [
            r.date,
            r.site_name,
            r.machine_name,
            r.shift,
            r.total_production,
            r.broken_wafers,
            r.good_wafers,
            r.breakage_percentage + "%",
            r.yield_percentage + "%"
        ]);
        const footerRows = [
            [
                "TOTALS",
                "",
                "",
                "",
                totalInput,
                totalBreakage,
                totalGood,
                brkPctTotal + "%",
                yieldPctTotal + "%"
            ]
        ];
        content = compileExcelHtml(title, metadata, headers, rows, footerRows);
    }
    
    const blob = new Blob([content], { type: asCSV ? 'text/csv;charset=utf-8;' : 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==================== PROCESS SPECS: BOATS, TRACKS, & MANUAL SUMMARY ====================
let activeModalRowIdx = null;

// Boats modal management
function openBoatsModal(rowIdx) {
    activeModalRowIdx = rowIdx;
    const row = currentSheetRows[rowIdx];
    if (!row) return;
    
    document.getElementById("boat-modal-title").textContent = `Hour: ${row.hour_label}`;
    
    let boats = [];
    try {
        if (row.metadata) {
            boats = JSON.parse(row.metadata) || [];
        }
    } catch (e) {
        boats = [];
    }
    
    rebuildBoatsTable(boats);
    document.getElementById("boat-modal").classList.remove("hidden");
}

function readBoatsFromDOM() {
    const tbody = document.getElementById("boat-modal-rows");
    const rows = tbody.querySelectorAll("tr");
    const boats = [];
    rows.forEach(tr => {
        const idInput = tr.querySelector(".boat-id-input");
        const brkInput = tr.querySelector(".boat-breakage-input");
        if (idInput && brkInput) {
            boats.push({
                id: idInput.value.trim(),
                breakage: parseInt(brkInput.value) || 0
            });
        }
    });
    return boats;
}

function rebuildBoatsTable(boats) {
    const tbody = document.getElementById("boat-modal-rows");
    tbody.innerHTML = "";
    
    if (boats.length === 0) {
        boats.push({ id: "", breakage: 0 });
    }
    
    boats.forEach((b, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><input type="text" value="${b.id || ''}" class="grid-cell boat-id-input" placeholder="e.g. B-01" style="text-align: left; background: #000; border: 1px solid var(--border-color);"></td>
            <td><input type="number" value="${b.breakage || 0}" min="0" class="grid-cell boat-breakage-input" style="text-align: right; background: #000; border: 1px solid var(--border-color);"></td>
            <td style="text-align: center;">
                <button class="secondary-btn btn-delete-boat" data-idx="${idx}" style="padding: 4px 8px; color: var(--primary-red); border-color: rgba(255, 51, 102, 0.2);"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Wire delete buttons
    tbody.querySelectorAll(".btn-delete-boat").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.getAttribute("data-idx"));
            const currentBoats = readBoatsFromDOM();
            currentBoats.splice(idx, 1);
            rebuildBoatsTable(currentBoats);
        });
    });
}

// Tracks modal management
function openTracksModal(rowIdx) {
    activeModalRowIdx = rowIdx;
    const row = currentSheetRows[rowIdx];
    if (!row) return;
    
    document.getElementById("track-modal-title").textContent = `Hour: ${row.hour_label}`;
    
    let tracks = {
        A: { input: 0, breakage: 0 },
        B: { input: 0, breakage: 0 },
        C: { input: 0, breakage: 0 },
        D: { input: 0, breakage: 0 },
        E: { input: 0, breakage: 0 }
    };
    
    try {
        if (row.metadata) {
            tracks = JSON.parse(row.metadata) || tracks;
        }
    } catch (e) {}
    
    ["A", "B", "C", "D", "E"].forEach(t => {
        document.getElementById(`track-in-${t}`).value = tracks[t]?.input || 0;
        document.getElementById(`track-br-${t}`).value = tracks[t]?.breakage || 0;
    });
    
    document.getElementById("track-modal").classList.remove("hidden");
}

function formatMetadataForRemarks(row) {
    if (!row.metadata) return "";
    try {
        const parsed = JSON.parse(row.metadata);
        if (Array.isArray(parsed)) {
            return " [Boats: " + parsed.map(b => `${b.id || '?'}(Brk:${b.breakage})`).join(", ") + "]";
        } else if (parsed && typeof parsed === "object") {
            return " [Tracks Split - " + Object.keys(parsed).map(k => `${k}: In:${parsed[k].input}/Brk:${parsed[k].breakage}`).join(" | ") + "]";
        }
    } catch(e) {}
    return "";
}

function initProcessSpecificModals() {
    // Wire Boat Modal actions
    const btnAddBoat = document.getElementById("btn-add-boat-row");
    if (btnAddBoat) {
        btnAddBoat.addEventListener("click", () => {
            const currentBoats = readBoatsFromDOM();
            currentBoats.push({ id: "", breakage: 0 });
            rebuildBoatsTable(currentBoats);
        });
    }
    
    const btnSaveBoats = document.getElementById("btn-save-boats");
    if (btnSaveBoats) {
        btnSaveBoats.addEventListener("click", () => {
            if (activeModalRowIdx === null) return;
            const boats = readBoatsFromDOM();
            const totalBreakage = boats.reduce((sum, b) => sum + b.breakage, 0);
            
            // Update local state row
            currentSheetRows[activeModalRowIdx].breakage_count = totalBreakage;
            currentSheetRows[activeModalRowIdx].metadata = JSON.stringify(boats);
            
            // Update input cell in DOM
            const brkCell = document.querySelector(`.grid-cell[data-row-idx="${activeModalRowIdx}"][data-field="breakage_count"]`);
            if (brkCell) brkCell.value = totalBreakage;
            
            // Update row formulas in DOM
            const row = currentSheetRows[activeModalRowIdx];
            row.good_count = (row.total_input || 0) - (row.breakage_count || 0);
            const good = row.good_count;
            const brkPct = good > 0 ? ((row.breakage_count / good) * 100).toFixed(2) + "%" : "0.00%";
            const yieldPct = row.total_input > 0 ? ((good / row.total_input) * 100).toFixed(2) + "%" : "0.00%";

            const goodInput = document.querySelector(`.grid-cell[data-row-idx="${activeModalRowIdx}"][data-field="good_count"]`);
            if (goodInput) {
                goodInput.value = good;
            }
            document.getElementById(`brk-pct-${activeModalRowIdx}`).textContent = brkPct;
            const yieldPctEl = document.getElementById(`yield-pct-${activeModalRowIdx}`);
            if (yieldPctEl) yieldPctEl.textContent = yieldPct;
            
            // Update print-only text in grid
            const btnEl = document.querySelector(`.btn-manage-boats[data-row-idx="${activeModalRowIdx}"]`);
            if (btnEl) {
                const spanEl = btnEl.parentElement.querySelector('.print-only');
                if (spanEl) {
                    spanEl.textContent = boats.map(b => `${b.id || '?'}(${b.breakage})`).join(", ") || "-";
                }
            }
            
            recalculateGridTotals();
            triggerDebouncedSave(activeModalRowIdx);
            document.getElementById("boat-modal").classList.add("hidden");
            activeModalRowIdx = null;
        });
    }
    
    const btnCloseBoats = document.getElementById("btn-close-boats");
    if (btnCloseBoats) {
        btnCloseBoats.addEventListener("click", () => {
            document.getElementById("boat-modal").classList.add("hidden");
            activeModalRowIdx = null;
        });
    }
    
    // Wire Tracks Modal actions
    const btnSaveTracks = document.getElementById("btn-save-tracks");
    if (btnSaveTracks) {
        btnSaveTracks.addEventListener("click", () => {
            if (activeModalRowIdx === null) return;
            const tracks = {};
            let totalInput = 0;
            let totalBreakage = 0;
            
            ["A", "B", "C", "D", "E"].forEach(t => {
                const inp = parseInt(document.getElementById(`track-in-${t}`).value) || 0;
                const brk = parseInt(document.getElementById(`track-br-${t}`).value) || 0;
                tracks[t] = { input: inp, breakage: brk };
                totalInput += inp;
                totalBreakage += brk;
            });
            
            // Update local state row
            currentSheetRows[activeModalRowIdx].total_input = totalInput;
            currentSheetRows[activeModalRowIdx].breakage_count = totalBreakage;
            currentSheetRows[activeModalRowIdx].metadata = JSON.stringify(tracks);
            
            // Update input cells in DOM
            const inCell = document.querySelector(`.grid-cell[data-row-idx="${activeModalRowIdx}"][data-field="total_input"]`);
            if (inCell) inCell.value = totalInput;
            
            const brkCell = document.querySelector(`.grid-cell[data-row-idx="${activeModalRowIdx}"][data-field="breakage_count"]`);
            if (brkCell) brkCell.value = totalBreakage;
            
            // Update row formulas in DOM
            const row = currentSheetRows[activeModalRowIdx];
            row.good_count = (row.total_input || 0) - (row.breakage_count || 0);
            const good = row.good_count;
            const brkPct = good > 0 ? ((row.breakage_count / good) * 100).toFixed(2) + "%" : "0.00%";
            const yieldPct = row.total_input > 0 ? ((good / row.total_input) * 100).toFixed(2) + "%" : "0.00%";

            const goodInput = document.querySelector(`.grid-cell[data-row-idx="${activeModalRowIdx}"][data-field="good_count"]`);
            if (goodInput) {
                goodInput.value = good;
            }
            document.getElementById(`brk-pct-${activeModalRowIdx}`).textContent = brkPct;
            const yieldPctEl = document.getElementById(`yield-pct-${activeModalRowIdx}`);
            if (yieldPctEl) yieldPctEl.textContent = yieldPct;
            
            // Update print-only text in grid
            const btnEl = document.querySelector(`.btn-manage-tracks[data-row-idx="${activeModalRowIdx}"]`);
            if (btnEl) {
                const spanEl = btnEl.parentElement.querySelector('.print-only');
                if (spanEl) {
                    spanEl.textContent = Object.keys(tracks).map(k => `${k}: ${tracks[k].input}/${tracks[k].breakage}`).join(" | ") || "-";
                }
            }
            
            recalculateGridTotals();
            triggerDebouncedSave(activeModalRowIdx);
            document.getElementById("track-modal").classList.add("hidden");
            activeModalRowIdx = null;
        });
    }
    
    const btnCloseTracks = document.getElementById("btn-close-tracks");
    if (btnCloseTracks) {
        btnCloseTracks.addEventListener("click", () => {
            document.getElementById("track-modal").classList.add("hidden");
            activeModalRowIdx = null;
        });
    }
    
    // Wire Summary Overwrite Modal actions
    const btnQuickSummary = document.getElementById("btn-quick-summary-entry");
    if (btnQuickSummary) {
        btnQuickSummary.addEventListener("click", () => {
            if (!currentSheetHeader) {
                alert("Please open a sheet first.");
                return;
            }
            // Populate defaults from current sheet totals if they exist
            let totIn = 0, totBr = 0, totGood = 0, totDt = 0;
            currentSheetRows.forEach(r => {
                totIn += r.total_input || 0;
                totBr += r.breakage_count || 0;
                let good = r.good_count;
                if (good === undefined || good === null) {
                    good = (r.total_input || 0) - (r.breakage_count || 0);
                }
                totGood += good;
                totDt += r.downtime_minutes || 0;
            });
            document.getElementById("summary-total-input").value = totIn;
            document.getElementById("summary-total-breakage").value = totBr;
            document.getElementById("summary-total-good").value = totGood;
            document.getElementById("summary-total-downtime").value = totDt;
            document.getElementById("summary-downtime-reason").value = currentSheetHeader.remarks_maintenance || "";
            document.getElementById("summary-remarks").value = currentSheetHeader.remarks_operator || "";
            
            document.getElementById("summary-modal").classList.remove("hidden");
        });
    }
    
    const btnCloseSummary = document.getElementById("btn-close-summary");
    if (btnCloseSummary) {
        btnCloseSummary.addEventListener("click", () => {
            document.getElementById("summary-modal").classList.add("hidden");
        });
    }
    
    const summaryForm = document.getElementById("summary-form");
    if (summaryForm) {
        summaryForm.addEventListener("submit", (e) => {
            e.preventDefault();
            if (!currentSheetHeader) return;
            
            const reqData = {
                record_id: currentSheetHeader.id,
                total_input: parseInt(document.getElementById("summary-total-input").value) || 0,
                breakage_count: parseInt(document.getElementById("summary-total-breakage").value) || 0,
                rejection_count: 0,
                good_count: parseInt(document.getElementById("summary-total-good").value) || 0,
                downtime_minutes: parseInt(document.getElementById("summary-total-downtime").value) || 0,
                downtime_reason: document.getElementById("summary-downtime-reason").value.trim(),
                remarks: document.getElementById("summary-remarks").value.trim()
            };
            
            fetch(`${API_BASE}/api/records/save-summary`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reqData)
            })
            .then(res => res.json())
            .then(data => {
                document.getElementById("summary-modal").classList.add("hidden");
                // Reload the sheet
                document.getElementById("btn-load-sheet").click();
            })
            .catch(err => {
                console.error(err);
                alert("Failed to save summary.");
            });
        });
    }
}

// ==================== DAILY TOOL SHEET IMPLEMENTATION ====================
let currentDailyToolRows = [];
let dailyToolSiteId = null;
let dailyToolDate = null;
let currentDailyToolRangeRows = [];
let rangeViewMode = "detailed";
let dailyToolSaveTimeout = null;

function triggerDailyToolDebouncedSave() {
    const saveBadge = document.getElementById("daily-tool-save-status");
    if (saveBadge) {
        saveBadge.className = "save-badge saving";
        saveBadge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
    }
    
    if (dailyToolSaveTimeout) clearTimeout(dailyToolSaveTimeout);
    
    dailyToolSaveTimeout = setTimeout(() => {
        if (!dailyToolSiteId || !dailyToolDate || currentDailyToolRows.length === 0) return;
        
        const entries = currentDailyToolRows.map(row => ({
            tool_name: row.tool_name,
            target: row.target,
            production: row.production,
            breakage: row.breakage
        }));
        
        fetch(`${API_BASE}/api/daily-tool-records/save-sheet`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ site_id: dailyToolSiteId, date: dailyToolDate, entries })
        })
        .then(res => res.json())
        .then(data => {
            if (saveBadge) {
                saveBadge.className = "save-badge saved";
                saveBadge.innerHTML = `<i class="fa-solid fa-check-circle"></i> Saved`;
            }
        })
        .catch(err => {
            console.error(err);
            if (saveBadge) {
                saveBadge.className = "save-badge";
                saveBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Error`;
            }
        });
    }, 1500); // 1.5s debounce
}

function initDailyToolSheet() {
    const btnLoad = document.getElementById("btn-load-daily-tool");
    const btnLoadRange = document.getElementById("btn-load-daily-tool-range");
    const btnSave = document.getElementById("btn-daily-tool-save");
    const btnAddTool = document.getElementById("btn-daily-tool-add-custom");
    
    const placeholder = document.getElementById("daily-tool-placeholder");
    const container = document.getElementById("daily-tool-container");
    const rangeContainer = document.getElementById("daily-tool-range-container");
    
    const btnDetailed = document.getElementById("btn-range-view-detailed");
    const btnSummary = document.getElementById("btn-range-view-summary");
    
    // Set default dates
    const today = new Date();
    document.getElementById("daily-tool-date").value = today.toISOString().slice(0, 10);
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);
    document.getElementById("daily-tool-start-date").value = sevenDaysAgo.toISOString().slice(0, 10);
    document.getElementById("daily-tool-end-date").value = today.toISOString().slice(0, 10);
    
    // Bind Range Presets
    const bindPreset = (id, getDates) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener("click", () => {
                const { start, end } = getDates();
                document.getElementById("daily-tool-start-date").value = start.toISOString().slice(0, 10);
                document.getElementById("daily-tool-end-date").value = end.toISOString().slice(0, 10);
                if (btnLoadRange) btnLoadRange.click();
            });
        }
    };
    
    bindPreset("btn-range-today", () => {
        const now = new Date();
        return { start: now, end: now };
    });
    bindPreset("btn-range-yesterday", () => {
        const start = new Date();
        start.setDate(start.getDate() - 1);
        const end = new Date();
        end.setDate(end.getDate() - 1);
        return { start, end };
    });
    bindPreset("btn-range-this-week", () => {
        const now = new Date();
        const d = new Date(now);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const start = new Date(d.setDate(diff));
        return { start, end: now };
    });
    bindPreset("btn-range-last-7", () => {
        const start = new Date();
        start.setDate(start.getDate() - 7);
        const end = new Date();
        return { start, end };
    });
    bindPreset("btn-range-this-month", () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start, end: now };
    });
    bindPreset("btn-range-last-30", () => {
        const start = new Date();
        start.setDate(start.getDate() - 30);
        const end = new Date();
        return { start, end };
    });

    // View toggles
    if (btnDetailed && btnSummary) {
        btnDetailed.addEventListener("click", () => {
            rangeViewMode = "detailed";
            btnDetailed.classList.add("primary-btn");
            btnDetailed.classList.remove("secondary-btn");
            btnSummary.classList.add("secondary-btn");
            btnSummary.classList.remove("primary-btn");
            buildDailyToolRangeRows();
        });
        btnSummary.addEventListener("click", () => {
            rangeViewMode = "summary";
            btnSummary.classList.add("primary-btn");
            btnSummary.classList.remove("secondary-btn");
            btnDetailed.classList.add("secondary-btn");
            btnDetailed.classList.remove("primary-btn");
            buildDailyToolRangeRows();
        });
    }

    if (btnLoad) {
        btnLoad.addEventListener("click", () => {
            const siteId = document.getElementById("daily-tool-site").value;
            const date = document.getElementById("daily-tool-date").value;
            
            if (!siteId || !date) {
                alert("Please select a Customer Site and Date first.");
                return;
            }
            
            dailyToolSiteId = parseInt(siteId);
            dailyToolDate = date;
            
            btnLoad.disabled = true;
            btnLoad.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Loading...`;
            
            fetch(`${API_BASE}/api/daily-tool-records/load-or-create`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ site_id: dailyToolSiteId, date: dailyToolDate })
            })
            .then(res => res.json())
            .then(data => {
                currentDailyToolRows = data.rows;
                
                placeholder.classList.add("hidden");
                rangeContainer.classList.add("hidden");
                container.classList.remove("hidden");
                
                // Update print elements
                const siteName = configData.sites.find(s => s.id == dailyToolSiteId)?.name || "Site";
                document.getElementById("daily-tool-sheet-title").textContent = `${siteName} - Daily Tool Sheet (${dailyToolDate})`;
                document.getElementById("print-daily-site-val").textContent = siteName;
                document.getElementById("print-daily-type-val").textContent = "Single Day Tool Report";
                document.getElementById("print-daily-date-val").textContent = dailyToolDate;
                
                buildDailyToolGridRows();
                recalculateDailyToolTotals();
                
                // Save status badge reset to Saved
                const saveBadge = document.getElementById("daily-tool-save-status");
                if (saveBadge) {
                    saveBadge.className = "save-badge saved";
                    saveBadge.innerHTML = `<i class="fa-solid fa-check-circle"></i> Saved`;
                }
            })
            .catch(err => {
                console.error(err);
                alert("Error loading daily tool sheet.");
            })
            .finally(() => {
                btnLoad.disabled = false;
                btnLoad.innerHTML = `<i class="fa-solid fa-folder-open"></i> Open Day`;
            });
        });
    }
    
    if (btnLoadRange) {
        btnLoadRange.addEventListener("click", () => {
            const siteId = document.getElementById("daily-tool-site").value;
            const startDate = document.getElementById("daily-tool-start-date").value;
            const endDate = document.getElementById("daily-tool-end-date").value;
            
            if (!siteId || !startDate || !endDate) {
                alert("Please select a Customer Site, Start Date, and End Date first.");
                return;
            }
            
            dailyToolSiteId = parseInt(siteId);
            
            btnLoadRange.disabled = true;
            btnLoadRange.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Loading...`;
            
            fetch(`${API_BASE}/api/daily-tool-records/history?site_id=${dailyToolSiteId}&start_date=${startDate}&end_date=${endDate}`)
            .then(res => res.json())
            .then(data => {
                currentDailyToolRangeRows = data;
                
                placeholder.classList.add("hidden");
                container.classList.add("hidden");
                rangeContainer.classList.remove("hidden");
                
                const siteName = configData.sites.find(s => s.id == dailyToolSiteId)?.name || "Site";
                document.getElementById("daily-tool-range-title").textContent = `${siteName} - Daily Tool Report (${startDate} to ${endDate})`;
                
                // Reset toggle view buttons to detailed view
                rangeViewMode = "detailed";
                if (btnDetailed && btnSummary) {
                    btnDetailed.classList.add("primary-btn", "active");
                    btnDetailed.classList.remove("secondary-btn");
                    btnSummary.classList.add("secondary-btn");
                    btnSummary.classList.remove("primary-btn", "active");
                }
                
                // Update print elements for range report
                document.getElementById("print-daily-range-site-val").textContent = siteName;
                document.getElementById("print-daily-range-date-val").textContent = `${startDate} to ${endDate}`;
                
                buildDailyToolRangeRows();
            })
            .catch(err => {
                console.error(err);
                alert("Error loading date range history.");
            })
            .finally(() => {
                btnLoadRange.disabled = false;
                btnLoadRange.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Load Range`;
            });
        });
    }
    
    if (btnSave) {
        btnSave.addEventListener("click", () => {
            if (!dailyToolSiteId || !dailyToolDate || currentDailyToolRows.length === 0) return;
            
            const saveBadge = document.getElementById("daily-tool-save-status");
            saveBadge.className = "save-badge saving";
            saveBadge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
            
            const entries = currentDailyToolRows.map(row => ({
                tool_name: row.tool_name,
                target: row.target,
                production: row.production,
                breakage: row.breakage
            }));
            
            fetch(`${API_BASE}/api/daily-tool-records/save-sheet`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ site_id: dailyToolSiteId, date: dailyToolDate, entries })
            })
            .then(res => res.json())
            .then(data => {
                saveBadge.className = "save-badge saved";
                saveBadge.innerHTML = `<i class="fa-solid fa-check-circle"></i> Saved`;
            })
            .catch(err => {
                console.error(err);
                saveBadge.className = "save-badge";
                saveBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Error`;
            });
        });
    }

    if (btnAddTool) {
        btnAddTool.addEventListener("click", () => {
            if (!dailyToolSiteId || !dailyToolDate) {
                alert("Please open a daily tool sheet first.");
                return;
            }
            
            const name = prompt("Enter Custom Tool / Process Machine Name:");
            if (!name) return;
            const trimmedName = name.trim();
            if (trimmedName === "") return;
            
            // Check for duplicates
            const exists = currentDailyToolRows.some(r => r.tool_name.toLowerCase() === trimmedName.toLowerCase());
            if (exists) {
                alert(`A tool named "${trimmedName}" already exists in this sheet.`);
                return;
            }
            
            // Add row
            const newRow = {
                site_id: dailyToolSiteId,
                date: dailyToolDate,
                tool_name: trimmedName,
                target: 110000,
                production: 0,
                breakage: 0
            };
            
            currentDailyToolRows.push(newRow);
            buildDailyToolGridRows();
            recalculateDailyToolTotals();
            triggerDailyToolDebouncedSave();
        });
    }
    
    // Bind Exports
    document.getElementById("btn-daily-export-excel").addEventListener("click", () => { exportDailyToolExcel(false); });
    document.getElementById("btn-daily-export-csv").addEventListener("click", () => { exportDailyToolExcel(true); });
    document.getElementById("btn-daily-export-pdf").addEventListener("click", () => { window.print(); });
    
    document.getElementById("btn-daily-range-export-excel").addEventListener("click", () => { exportDailyToolRangeExcel(false); });
    document.getElementById("btn-daily-range-export-csv").addEventListener("click", () => { exportDailyToolRangeExcel(true); });
    document.getElementById("btn-daily-range-print-pdf").addEventListener("click", () => { window.print(); });
}

function buildDailyToolGridRows() {
    const tbody = document.getElementById("daily-tool-rows-body");
    tbody.innerHTML = "";
    
    currentDailyToolRows.forEach((row, idx) => {
        const tr = document.createElement("tr");
        tr.id = `daily-tool-row-${idx}`;
        
        const brkPctVal = row.production > 0 ? ((row.breakage / row.production) * 100) : 0;
        const brkPctStr = brkPctVal.toFixed(2) + "%";
        
        tr.innerHTML = `
            <td class="non-input font-bold text-secondary">${row.tool_name}</td>
            <td><input type="number" value="${row.target}" data-idx="${idx}" data-field="target" class="grid-cell daily-tool-input"></td>
            <td><input type="number" value="${row.production}" data-idx="${idx}" data-field="production" class="grid-cell daily-tool-input"></td>
            <td><input type="number" value="${row.breakage}" data-idx="${idx}" data-field="breakage" class="grid-cell daily-tool-input text-red"></td>
            <td id="daily-tool-brk-pct-${idx}" class="non-input text-red font-bold text-right">${brkPctStr}</td>
            <td class="screen-only" style="text-align: center;">
                <button class="secondary-btn btn-sm btn-delete-tool" data-idx="${idx}" style="padding: 4px 8px; color: var(--primary-red); border-color: #3b181c; background: #160a0c;" title="Delete Tool">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
    
    const inputs = document.querySelectorAll(".daily-tool-input");
    inputs.forEach(inp => {
        inp.addEventListener("input", (e) => {
            const idx = parseInt(e.target.getAttribute("data-idx"));
            const field = e.target.getAttribute("data-field");
            const val = parseInt(e.target.value) || 0;
            
            currentDailyToolRows[idx][field] = val;
            
            const row = currentDailyToolRows[idx];
            const brkPctVal = row.production > 0 ? ((row.breakage / row.production) * 100) : 0;
            document.getElementById(`daily-tool-brk-pct-${idx}`).textContent = brkPctVal.toFixed(2) + "%";
            
            recalculateDailyToolTotals();
            triggerDailyToolDebouncedSave();
        });
        
        inp.addEventListener("keydown", (e) => {
            const idx = parseInt(e.target.getAttribute("data-idx"));
            const field = e.target.getAttribute("data-field");
            const totalRows = currentDailyToolRows.length;
            
            const cols = ["target", "production", "breakage"];
            const colIdx = cols.indexOf(field);
            
            let nextRowIdx = idx;
            let nextColIdx = colIdx;
            
            if (e.key === "ArrowUp") {
                nextRowIdx = Math.max(0, idx - 1);
                e.preventDefault();
            } else if (e.key === "ArrowDown" || e.key === "Enter") {
                nextRowIdx = Math.min(totalRows - 1, idx + 1);
                e.preventDefault();
            } else if (e.key === "ArrowLeft") {
                if (e.target.type === "number" || e.target.selectionStart === 0) {
                    nextColIdx = Math.max(0, colIdx - 1);
                }
            } else if (e.key === "ArrowRight") {
                if (e.target.type === "number" || e.target.selectionEnd === e.target.value.length) {
                    nextColIdx = Math.min(cols.length - 1, colIdx + 1);
                }
            } else if (e.key === "Tab") {
                if (e.shiftKey) {
                    if (colIdx === 0 && idx > 0) {
                        nextRowIdx = idx - 1;
                        nextColIdx = cols.length - 1;
                        e.preventDefault();
                    }
                } else {
                    if (colIdx === cols.length - 1 && idx < totalRows - 1) {
                        nextRowIdx = idx + 1;
                        nextColIdx = 0;
                        e.preventDefault();
                    }
                }
            } else {
                return;
            }
            
            const targetEl = tbody.querySelector(`.daily-tool-input[data-idx="${nextRowIdx}"][data-field="${cols[nextColIdx]}"]`);
            if (targetEl) {
                targetEl.focus();
                targetEl.select();
            }
        });
    });

    const deleteBtns = tbody.querySelectorAll(".btn-delete-tool");
    deleteBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            const btnEl = e.currentTarget;
            const idx = parseInt(btnEl.getAttribute("data-idx"));
            const toolToDelete = currentDailyToolRows[idx];
            
            if (confirm(`Are you sure you want to delete the tool "${toolToDelete.tool_name}"?`)) {
                fetch(`${API_BASE}/api/daily-tool-records/delete-tool`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        site_id: dailyToolSiteId,
                        date: dailyToolDate,
                        tool_name: toolToDelete.tool_name
                    })
                })
                .then(res => res.json())
                .then(data => {
                    currentDailyToolRows.splice(idx, 1);
                    buildDailyToolGridRows();
                    recalculateDailyToolTotals();
                    
                    const saveBadge = document.getElementById("daily-tool-save-status");
                    if (saveBadge) {
                        saveBadge.className = "save-badge saved";
                        saveBadge.innerHTML = `<i class="fa-solid fa-check-circle"></i> Saved`;
                    }
                })
                .catch(err => {
                    console.error(err);
                    alert("Error deleting tool from database.");
                });
            }
        });
    });
}

function recalculateDailyToolTotals() {
    let totBr = 0;
    let totBrPct = 0;
    
    currentDailyToolRows.forEach((row, idx) => {
        totBr += row.breakage || 0;
        const brkPctVal = row.production > 0 ? ((row.breakage / row.production) * 100) : 0;
        totBrPct += brkPctVal;
    });
    
    document.getElementById("daily-tool-total-breakage").textContent = totBr.toLocaleString();
    document.getElementById("daily-tool-total-breakage-pct").textContent = totBrPct.toFixed(2) + "%";
}

function buildDailyToolRangeRows() {
    const tbody = document.getElementById("daily-tool-range-body");
    const thead = document.getElementById("daily-tool-range-header");
    tbody.innerHTML = "";
    
    if (rangeViewMode === "detailed") {
        thead.innerHTML = `
            <tr>
                <th>Date</th>
                <th>Tool Name</th>
                <th>Target</th>
                <th>Production</th>
                <th>Breakage (Nos)</th>
                <th>Breakage (%)</th>
            </tr>
        `;
        
        currentDailyToolRangeRows.forEach(row => {
            const tr = document.createElement("tr");
            const brkPctVal = row.production > 0 ? ((row.breakage / row.production) * 100) : 0;
            
            tr.innerHTML = `
                <td>${row.date}</td>
                <td class="font-bold text-secondary">${row.tool_name}</td>
                <td class="text-right">${row.target.toLocaleString()}</td>
                <td class="text-right">${row.production.toLocaleString()}</td>
                <td class="text-right text-red">${row.breakage.toLocaleString()}</td>
                <td class="text-right text-red font-bold">${brkPctVal.toFixed(2)}%</td>
            `;
            tbody.appendChild(tr);
        });
    } else {
        thead.innerHTML = `
            <tr>
                <th>Tool Name</th>
                <th>Total Target</th>
                <th>Total Production</th>
                <th>Total Breakage</th>
                <th>Overall Breakage (%)</th>
            </tr>
        `;
        
        const groups = {};
        currentDailyToolRangeRows.forEach(row => {
            if (!groups[row.tool_name]) {
                groups[row.tool_name] = {
                    tool_name: row.tool_name,
                    target: 0,
                    production: 0,
                    breakage: 0
                };
            }
            groups[row.tool_name].target += row.target;
            groups[row.tool_name].production += row.production;
            groups[row.tool_name].breakage += row.breakage;
        });
        
        Object.values(groups).forEach(g => {
            const tr = document.createElement("tr");
            const brkPctVal = g.production > 0 ? ((g.breakage / g.production) * 100) : 0;
            
            tr.innerHTML = `
                <td class="font-bold text-secondary">${g.tool_name}</td>
                <td class="text-right">${g.target.toLocaleString()}</td>
                <td class="text-right">${g.production.toLocaleString()}</td>
                <td class="text-right text-red">${g.breakage.toLocaleString()}</td>
                <td class="text-right text-red font-bold">${brkPctVal.toFixed(2)}%</td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function exportDailyToolExcel(asCSV = false) {
    if (currentDailyToolRows.length === 0) return;
    
    const siteName = configData.sites.find(s => s.id == dailyToolSiteId)?.name || "Site";
    let content = "";
    let filename = "";
    
    let totBr = 0;
    let totBrPct = 0;
    currentDailyToolRows.forEach(row => {
        totBr += row.breakage || 0;
        const brkPctVal = row.production > 0 ? ((row.breakage / row.production) * 100) : 0;
        totBrPct += brkPctVal;
    });

    if (asCSV) {
        filename = `daily_tool_${siteName.split(" ")[0]}_${dailyToolDate}.csv`;
        content += `"NMTronics Solar Cell Daily Tool Report"\n`;
        content += `"Site Name:","${siteName}"\n`;
        content += `"Date:","${dailyToolDate}"\n\n`;
        content += "Tool Name,Target,Production,Breakage (Nos),Breakage (%)\n";
        
        currentDailyToolRows.forEach(r => {
            const pct = r.production > 0 ? ((r.breakage / r.production) * 100).toFixed(2) : "0.00";
            content += `${r.tool_name},${r.target},${r.production},${r.breakage},${pct}%\n`;
        });
        content += `Total Tool Breakage and Rejection %,,,${totBr},${totBrPct.toFixed(2)}%\n`;
    } else {
        filename = `daily_tool_${siteName.split(" ")[0]}_${dailyToolDate}.xls`;
        
        const title = "NMTronics Solar Cell Daily Tool Report";
        const metadata = [
            { label: "Site Name", value: siteName },
            { label: "Date", value: dailyToolDate },
            { label: "Exported on", value: new Date().toLocaleString() }
        ];
        const headers = [
            { label: "Tool Name", align: "left" },
            { label: "Target", align: "right" },
            { label: "Production", align: "right" },
            { label: "Breakage (Nos)", align: "right", type: "red" },
            { label: "Breakage (%)", align: "right", type: "red" }
        ];
        const rows = currentDailyToolRows.map(r => {
            const pct = r.production > 0 ? ((r.breakage / r.production) * 100).toFixed(2) : "0.00";
            return [
                r.tool_name,
                r.target,
                r.production,
                r.breakage,
                pct + "%"
            ];
        });
        const footerRows = [
            [
                "Total Tool Breakage and Rejection %",
                "",
                "",
                totBr,
                totBrPct.toFixed(2) + "%"
            ]
        ];
        content = compileExcelHtml(title, metadata, headers, rows, footerRows);
    }
    
    const blob = new Blob([content], { type: asCSV ? 'text/csv;charset=utf-8;' : 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportDailyToolRangeExcel(asCSV = false) {
    if (currentDailyToolRangeRows.length === 0) return;
    
    const siteName = configData.sites.find(s => s.id == dailyToolSiteId)?.name || "Site";
    let content = "";
    let filename = `daily_tool_range_${siteName.split(" ")[0]}_export`;
    
    const startDate = document.getElementById("daily-tool-start-date").value;
    const endDate = document.getElementById("daily-tool-end-date").value;
    
    if (rangeViewMode === "detailed") {
        if (asCSV) {
            filename += ".csv";
            content += `"NMTronics Consolidated Daily Tool Report - Detailed"\n`;
            content += `"Site Name:","${siteName}"\n\n`;
            content += "Date,Tool Name,Target,Production,Breakage (Nos),Breakage (%)\n";
            
            currentDailyToolRangeRows.forEach(r => {
                const pct = r.production > 0 ? ((r.breakage / r.production) * 100).toFixed(2) : "0.00";
                content += `${r.date},${r.tool_name},${r.target},${r.production},${r.breakage},${pct}%\n`;
            });
        } else {
            filename += ".xls";
            
            const title = "NMTronics Consolidated Daily Tool Report - Detailed";
            const metadata = [
                { label: "Site Name", value: siteName },
                { label: "Report Period", value: `${startDate} to ${endDate}` },
                { label: "Exported on", value: new Date().toLocaleString() }
            ];
            const headers = [
                { label: "Date", align: "left" },
                { label: "Tool Name", align: "left" },
                { label: "Target", align: "right" },
                { label: "Production", align: "right" },
                { label: "Breakage (Nos)", align: "right", type: "red" },
                { label: "Breakage (%)", align: "right", type: "red" }
            ];
            const rows = currentDailyToolRangeRows.map(r => {
                const pct = r.production > 0 ? ((r.breakage / r.production) * 100).toFixed(2) : "0.00";
                return [
                    r.date,
                    r.tool_name,
                    r.target,
                    r.production,
                    r.breakage,
                    pct + "%"
                ];
            });
            content = compileExcelHtml(title, metadata, headers, rows);
        }
    } else {
        const groups = {};
        currentDailyToolRangeRows.forEach(row => {
            if (!groups[row.tool_name]) {
                groups[row.tool_name] = {
                    tool_name: row.tool_name,
                    target: 0,
                    production: 0,
                    breakage: 0
                };
            }
            groups[row.tool_name].target += row.target;
            groups[row.tool_name].production += row.production;
            groups[row.tool_name].breakage += row.breakage;
        });

        if (asCSV) {
            filename += "_summary.csv";
            content += `"NMTronics Consolidated Daily Tool Report - Aggregated Summary"\n`;
            content += `"Site Name:","${siteName}"\n\n`;
            content += "Tool Name,Total Target,Total Production,Total Breakage,Overall Breakage (%)\n";
            
            Object.values(groups).forEach(g => {
                const pct = g.production > 0 ? ((g.breakage / g.production) * 100).toFixed(2) : "0.00";
                content += `${g.tool_name},${g.target},${g.production},${g.breakage},${pct}%\n`;
            });
        } else {
            filename += "_summary.xls";
            
            const title = "NMTronics Consolidated Daily Tool Report - Aggregated Summary";
            const metadata = [
                { label: "Site Name", value: siteName },
                { label: "Report Period", value: `${startDate} to ${endDate}` },
                { label: "Exported on", value: new Date().toLocaleString() }
            ];
            const headers = [
                { label: "Tool Name", align: "left" },
                { label: "Total Target", align: "right" },
                { label: "Total Production", align: "right" },
                { label: "Total Breakage", align: "right", type: "red" },
                { label: "Overall Breakage (%)", align: "right", type: "red" }
            ];
            const rows = Object.values(groups).map(g => {
                const pct = g.production > 0 ? ((g.breakage / g.production) * 100).toFixed(2) : "0.00";
                return [
                    g.tool_name,
                    g.target,
                    g.production,
                    g.breakage,
                    pct + "%"
                ];
            });
            content = compileExcelHtml(title, metadata, headers, rows);
        }
    }
    
    const blob = new Blob([content], { type: asCSV ? 'text/csv;charset=utf-8;' : 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Reusable helper to generate highly structured, beautifully styled HTML Excel tables
function compileExcelHtml(title, metadata, headers, rows, footerRows = null) {
    let html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Sheet1</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  table { border-collapse: collapse; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; width: 100%; }
  td, th { border: 1px solid #d1d5db; padding: 8px 12px; font-size: 10pt; text-align: left; }
  th { background-color: #0f172a; color: #ffffff; font-weight: bold; font-size: 11pt; border: 1px solid #334155; }
  .title-row { font-size: 16pt; font-weight: bold; color: #0f172a; border: none; padding-bottom: 10px; }
  .meta-label { font-weight: bold; background-color: #f8fafc; color: #475569; width: 200px; }
  .meta-value { color: #0f172a; }
  .totals-row td { font-weight: bold; background-color: #f1f5f9; color: #0f172a; border-top: 2px solid #94a3b8; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .text-red { color: #dc2626; font-weight: bold; }
  .text-green { color: #16a34a; font-weight: bold; }
  .text-cyan { color: #0891b2; font-weight: bold; }
</style>
</head>
<body>
  <table>
    <tr>
      <td colspan="${headers.length}" class="title-row">${title}</td>
    </tr>
`;

    // Add metadata rows
    metadata.forEach(meta => {
        html += `
    <tr>
      <td class="meta-label">${meta.label}</td>
      <td colspan="${headers.length - 1}" class="meta-value">${meta.value}</td>
    </tr>`;
    });

    // Spacer row
    html += `<tr><td colspan="${headers.length}" style="border: none; height: 15px;"></td></tr>`;

    // Header row
    html += `    <tr>`;
    headers.forEach(h => {
        let alignClass = h.align ? ` class="text-${h.align}"` : '';
        html += `<th${alignClass}>${h.label}</th>`;
    });
    html += `</tr>`;

    // Data rows
    rows.forEach(row => {
        html += `    <tr>`;
        row.forEach((cell, cellIdx) => {
            let h = headers[cellIdx];
            let classes = [];
            if (h.align) classes.push(`text-${h.align}`);
            if (h.type === 'red') classes.push('text-red');
            if (h.type === 'green') classes.push('text-green');
            if (h.type === 'cyan') classes.push('text-cyan');
            
            let classAttr = classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
            html += `<td${classAttr}>${cell === null || cell === undefined ? '' : cell}</td>`;
        });
        html += `</tr>`;
    });

    // Footer rows
    if (footerRows) {
        footerRows.forEach(row => {
            html += `    <tr class="totals-row">`;
            row.forEach((cell, cellIdx) => {
                let h = headers[cellIdx];
                let classes = [];
                if (h.align) classes.push(`text-${h.align}`);
                if (h.type === 'red') classes.push('text-red');
                if (h.type === 'green') classes.push('text-green');
                if (h.type === 'cyan') classes.push('text-cyan');
                
                let classAttr = classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
                html += `<td${classAttr}>${cell === null || cell === undefined ? '' : cell}</td>`;
            });
            html += `</tr>`;
        });
    }

    html += `
  </table>
</body>
</html>`;
    return html;
}

function initMobileMenu() {
    const mobileToggle = document.getElementById("mobile-menu-toggle");
    const sidebar = document.querySelector(".sidebar");
    const navButtons = document.querySelectorAll(".nav-btn");
    
    if (mobileToggle && sidebar) {
        mobileToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            sidebar.classList.toggle("active");
        });
        
        // Close sidebar when clicking menu links on mobile
        navButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                sidebar.classList.remove("active");
            });
        });
        
        // Close sidebar when clicking outside on mobile
        document.addEventListener("click", (e) => {
            if (sidebar.classList.contains("active") && !sidebar.contains(e.target) && e.target !== mobileToggle) {
                sidebar.classList.remove("active");
            }
        });
    }
}

// ==========================================================================
// NEW VIEWS LOGIC: HOME, RCA/SOP, & ANNOUNCEMENTS
// ==========================================================================

let chartProduction = null;
let chartBreakage = null;
let chartDowntime = null;

function loadDashboardData() {
    fetch(`${API_BASE}/api/analytics/dashboard`)
        .then(res => res.json())
        .then(data => {
            // 1. Calculate KPIs
            let totalProd = 0;
            let totalBroken = 0;
            let totalRejected = 0;
            let totalDowntime = 0;

            data.site_performance.forEach(s => {
                totalProd += s.total_prod || 0;
                totalBroken += s.total_broken || 0;
                totalRejected += s.total_rejected || 0;
            });

            data.downtime_reasons.forEach(d => {
                totalDowntime += d.minutes || 0;
            });

            const totalGood = totalProd - totalBroken - totalRejected;
            const avgBreakage = totalGood > 0 ? (totalBroken / totalGood) * 100 : 0;

            // Update UI
            document.getElementById("kpi-total-production").textContent = totalProd.toLocaleString();
            document.getElementById("kpi-total-good").textContent = totalGood.toLocaleString();
            document.getElementById("kpi-avg-breakage").textContent = avgBreakage.toFixed(2) + "%";
            document.getElementById("kpi-total-downtime").textContent = totalDowntime.toLocaleString() + " min";

            // 2. Render Charts
            renderDashboardCharts(data);

            // 3. Load latest announcements widget
            loadHomeAnnouncements();
        })
        .catch(err => console.error("Error loading dashboard metrics:", err));
}

function renderDashboardCharts(data) {
    const ctxProd = document.getElementById("chart-site-production").getContext("2d");
    const ctxYield = document.getElementById("chart-yield-trends").getContext("2d");
    const ctxDowntime = document.getElementById("chart-downtime-causes").getContext("2d");

    // Destory existing charts
    if (chartProduction) chartProduction.destroy();
    if (chartBreakage) chartBreakage.destroy();
    if (chartDowntime) chartDowntime.destroy();

    // Chart 1: Site Production
    const labelsProd = data.site_performance.map(s => s.site_name.replace(" Solar", "").replace(" Energies", ""));
    const datasetProd = data.site_performance.map(s => s.total_prod);

    chartProduction = new Chart(ctxProd, {
        type: 'bar',
        data: {
            labels: labelsProd,
            datasets: [{
                label: 'Total Production (Wafers)',
                data: datasetProd,
                backgroundColor: 'rgba(6, 182, 212, 0.4)',
                borderColor: 'var(--primary-cyan)',
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'var(--text-secondary)' } },
                x: { grid: { display: false }, ticks: { color: 'var(--text-secondary)' } }
            }
        }
    });

    // Chart 2: Breakage Trends (by Date)
    const labelsTrends = data.yield_trends.map(t => t.date);
    const datasetBreakage = data.yield_trends.map(t => t.avg_breakage);

    chartBreakage = new Chart(ctxYield, {
        type: 'line',
        data: {
            labels: labelsTrends,
            datasets: [{
                label: 'Avg Breakage %',
                data: datasetBreakage,
                borderColor: 'var(--primary-red)',
                backgroundColor: 'rgba(239, 68, 68, 0.05)',
                borderWidth: 2,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'var(--text-secondary)' } },
                x: { grid: { display: false }, ticks: { color: 'var(--text-secondary)' } }
            }
        }
    });

    // Chart 3: Downtime Causes
    const labelsDowntime = data.downtime_reasons.slice(0, 5).map(d => d.reason);
    const datasetDowntime = data.downtime_reasons.slice(0, 5).map(d => d.minutes);

    chartDowntime = new Chart(ctxDowntime, {
        type: 'doughnut',
        data: {
            labels: labelsDowntime,
            datasets: [{
                data: datasetDowntime,
                backgroundColor: [
                    'rgba(249, 115, 22, 0.6)', // Orange
                    'rgba(6, 182, 212, 0.6)',  // Cyan
                    'rgba(239, 68, 68, 0.6)',  // Red
                    'rgba(168, 85, 247, 0.6)', // Purple
                    'rgba(234, 179, 8, 0.6)'   // Yellow
                ],
                borderColor: 'var(--card-bg)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: 'var(--text-secondary)', font: { size: 10 } }
                }
            }
        }
    });
}

function loadHomeAnnouncements() {
    fetch(`${API_BASE}/api/announcements`)
        .then(res => res.json())
        .then(announcements => {
            const feed = document.getElementById("home-announcements-feed");
            if (!feed) return;
            feed.innerHTML = "";

            if (announcements.length === 0) {
                feed.innerHTML = `<div class="text-muted" style="font-size: 12px; text-align: center; margin-top: 20px;">No announcements posted yet.</div>`;
                return;
            }

            announcements.slice(0, 3).forEach(a => {
                const card = `
                    <div class="mini-announcement-card">
                        <div class="mini-announcement-header">
                            <span class="mini-announcement-author">${escapeHTML(a.author)}</span>
                            <span class="mini-announcement-time">${formatDateString(a.timestamp)}</span>
                        </div>
                        <div class="mini-announcement-text">${escapeHTML(a.content)}</div>
                    </div>
                `;
                feed.innerHTML += card;
            });
        })
        .catch(err => console.error("Error loading widget announcements:", err));
}

// ----------------- SOP & RCA DOCUMENTS LOGIC -----------------
let documentsList = [];
let currentDocFilter = "ALL";

function initRcaPortal() {
    const uploadForm = document.getElementById("rca-upload-form");
    if (uploadForm) {
        uploadForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const formData = new FormData();
            formData.append("site_id", document.getElementById("rca-site-select").value);
            formData.append("doc_type", document.getElementById("rca-doc-type").value);
            formData.append("title", document.getElementById("rca-title-input").value);
            formData.append("date", document.getElementById("rca-date-input").value);
            formData.append("logged_by", document.getElementById("rca-logged-input").value);
            formData.append("file", document.getElementById("rca-file-input").files[0]);

            fetch(`${API_BASE}/api/rca`, {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                showToast("Document uploaded successfully!", "success");
                uploadForm.reset();
                loadRcaDocuments();
            })
            .catch(err => {
                console.error("Upload error:", err);
                showToast("Failed to upload document", "error");
            });
        });
    }

    // Filters
    const filterAll = document.getElementById("btn-doc-filter-all");
    const filterSop = document.getElementById("btn-doc-filter-sop");
    const filterRca = document.getElementById("btn-doc-filter-rca");

    if (filterAll) {
        filterAll.addEventListener("click", () => {
            setActiveDocFilter("ALL", filterAll);
        });
    }
    if (filterSop) {
        filterSop.addEventListener("click", () => {
            setActiveDocFilter("SOP", filterSop);
        });
    }
    if (filterRca) {
        filterRca.addEventListener("click", () => {
            setActiveDocFilter("RCA", filterRca);
        });
    }
}

function setActiveDocFilter(filter, activeBtn) {
    currentDocFilter = filter;
    const buttons = [
        document.getElementById("btn-doc-filter-all"),
        document.getElementById("btn-doc-filter-sop"),
        document.getElementById("btn-doc-filter-rca")
    ];
    buttons.forEach(btn => {
        if (btn) {
            btn.classList.remove("active");
            btn.style.background = "#131922";
            btn.style.borderColor = "#2a3447";
            btn.style.color = "var(--text-primary)";
        }
    });

    if (activeBtn) {
        activeBtn.classList.add("active");
        activeBtn.style.background = "var(--primary-cyan)";
        activeBtn.style.color = "#000";
    }
    renderDocumentsList();
}

function loadRcaDocuments() {
    fetch(`${API_BASE}/api/rca`)
        .then(res => res.json())
        .then(data => {
            documentsList = data;
            renderDocumentsList();
        })
        .catch(err => console.error("Error loading documents:", err));
}

function renderDocumentsList() {
    const tbody = document.getElementById("rca-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const filtered = documentsList.filter(doc => {
        if (currentDocFilter === "ALL") return true;
        return doc.doc_type === currentDocFilter;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-muted" style="text-align: center;">No documents in library.</td></tr>`;
        return;
    }

    filtered.forEach(doc => {
        const typeBadge = doc.doc_type === "SOP" 
            ? `<span class="doc-badge doc-badge-sop">SOP</span>` 
            : `<span class="doc-badge doc-badge-rca">RCA</span>`;

        const row = `
            <tr>
                <td>${typeBadge}</td>
                <td><strong class="text-cyan">${escapeHTML(doc.title)}</strong></td>
                <td>${escapeHTML(doc.site_name || "Unknown Site")}</td>
                <td>${escapeHTML(doc.logged_by || "-")}</td>
                <td>${doc.date}</td>
                <td>
                    <div style="display: flex; gap: 6px;">
                        <a href="/uploads/rca/${doc.filename}" download="${doc.title}" class="secondary-btn btn-sm" style="padding: 4px 8px; font-size: 10px; background: rgba(0, 240, 255, 0.05); border-color: rgba(0, 240, 255, 0.2); color: var(--primary-cyan);">
                            <i class="fa-solid fa-download"></i>
                        </a>
                        <button onclick="deleteRcaDocument(${doc.id})" class="secondary-btn btn-sm text-red" style="padding: 4px 8px; font-size: 10px; border-color: rgba(255, 51, 102, 0.2); background: rgba(255, 51, 102, 0.02);">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

function deleteRcaDocument(docId) {
    if (!confirm("Are you sure you want to delete this document?")) return;
    
    fetch(`${API_BASE}/api/rca/${docId}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(() => {
            showToast("Document deleted successfully!", "success");
            loadRcaDocuments();
        })
        .catch(err => {
            console.error("Delete error:", err);
            showToast("Failed to delete document", "error");
        });
}

// ----------------- ANNOUNCEMENTS STREAM LOGIC -----------------
function initAnnouncements() {
    const postForm = document.getElementById("announcement-post-form");
    const textarea = document.getElementById("announce-content");
    const countSpan = document.getElementById("announce-char-count");

    if (textarea && countSpan) {
        textarea.addEventListener("input", () => {
            countSpan.textContent = textarea.value.length;
        });
    }

    if (postForm) {
        postForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const formData = new FormData();
            formData.append("author", document.getElementById("announce-author").value);
            formData.append("content", document.getElementById("announce-content").value);
            
            const fileEl = document.getElementById("announce-image");
            if (fileEl && fileEl.files.length > 0) {
                formData.append("image", fileEl.files[0]);
            }

            fetch(`${API_BASE}/api/announcements`, {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(() => {
                showToast("Announcement published!", "success");
                postForm.reset();
                if (countSpan) countSpan.textContent = "0";
                loadAnnouncements();
            })
            .catch(err => {
                console.error("Error posting announcement:", err);
                showToast("Failed to publish announcement", "error");
            });
        });
    }
}

function loadAnnouncements() {
    fetch(`${API_BASE}/api/announcements`)
        .then(res => res.json())
        .then(announcements => {
            const container = document.getElementById("announcements-feed-container");
            if (!container) return;
            container.innerHTML = "";

            if (announcements.length === 0) {
                container.innerHTML = `<div class="text-muted" style="text-align: center; padding: 40px 20px;">No announcements in stream yet. Be the first to share one!</div>`;
                return;
            }

            announcements.forEach(a => {
                const initials = a.author ? a.author.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : "OP";
                let mediaHtml = "";
                if (a.image_path) {
                    mediaHtml = `
                        <div class="announcement-media">
                            <img src="/uploads/announcements/${a.image_path}" alt="Post media" onclick="window.open(this.src)" style="cursor: pointer;">
                        </div>
                    `;
                }

                const card = `
                    <div class="announcement-card">
                        <div class="announcement-avatar">${initials}</div>
                        <div class="announcement-body">
                            <div class="announcement-header">
                                <span class="announcement-author">${escapeHTML(a.author)}</span>
                                <span class="announcement-time">${formatDateString(a.timestamp)}</span>
                            </div>
                            <div class="announcement-text">${escapeHTML(a.content)}</div>
                            ${mediaHtml}
                        </div>
                    </div>
                `;
                container.innerHTML += card;
            });
        })
        .catch(err => console.error("Error loading stream:", err));
}

// Helpers
function formatDateString(timestampStr) {
    try {
        const parts = timestampStr.split(' ');
        const dateParts = parts[0].split('-');
        const timeParts = parts[1].split(':');
        
        const dateObj = new Date(
            parseInt(dateParts[0]),
            parseInt(dateParts[1]) - 1,
            parseInt(dateParts[2]),
            parseInt(timeParts[0]),
            parseInt(timeParts[1]),
            parseInt(timeParts[2] || "0")
        );
        
        return dateObj.toLocaleDateString(undefined, { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        }) + " " + dateObj.toLocaleTimeString(undefined, { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    } catch (e) {
        return timestampStr;
    }
}

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

function showToast(message, type = "success") {
    const alertEl = document.createElement("div");
    alertEl.style.position = "fixed";
    alertEl.style.bottom = "20px";
    alertEl.style.right = "20px";
    alertEl.style.background = type === "success" ? "var(--primary-green)" : "var(--primary-red)";
    alertEl.style.color = "#000";
    alertEl.style.padding = "12px 24px";
    alertEl.style.borderRadius = "8px";
    alertEl.style.boxShadow = "0 8px 30px rgba(0,0,0,0.5)";
    alertEl.style.fontFamily = "var(--font-outfit)";
    alertEl.style.fontWeight = "600";
    alertEl.style.zIndex = "9999";
    alertEl.style.transition = "all 0.3s ease";
    alertEl.textContent = message;
    
    document.body.appendChild(alertEl);
    setTimeout(() => {
        alertEl.style.opacity = "0";
        setTimeout(() => alertEl.remove(), 300);
    }, 3000);
}
