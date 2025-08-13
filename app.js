// Enhanced Tax Calendar Application with Supabase - Performance and Feature Update
// Supabase Configuration
import { createClient } from 'https://cdn.skypack.dev/@supabase/supabase-js@2.39.3';

const CONFIG = {
    SUPABASE_URL: 'https://zmttoeuxnmavjvnfldyr.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptdHRvZXV4bm1hdmp2bmZsZHlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ2MTk5MTEsImV4cCI6MjA3MDE5NTkxMX0.e89FErAnrwA6jgKp9V9ZHjnIVPFnG7oeshDg_-fTr44',
    TABLE_NAME: 'Calendario Tributario'
};

// Initialize Supabase client
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

// Global State Management
class AppState {
    constructor() {
        this.isConnected = false;
        this.isLoading = false;
        this.data = [];
        this.filteredData = [];
        this.calendar = null;
        this.currentEditingRow = null;
        this.activeStatFilter = null;
        this.selectedRows = new Set();
    }

    setLoading(loading) {
        this.isLoading = loading;
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.toggle('hidden', !loading);
        }
    }

    updateConnectionStatus(status, message) {
        const banner = document.getElementById('connectionStatus');
        const icon = document.getElementById('statusIcon');
        const text = document.getElementById('statusText');
        const retryBtn = document.getElementById('retryBtn');

        if (!banner || !icon || !text) return;

        banner.className = `connection-status ${status}`;
        banner.classList.remove('hidden');
        
        const icons = { success: '✅', error: '❌', loading: '⚠️' };
        icon.textContent = icons[status] || '⚠️';
        
        text.textContent = message;
        retryBtn?.classList.toggle('hidden', status !== 'error');
    }
}

const appState = new AppState();

// Alert System
class AlertManager {
    static show(message, type = 'info', duration = 5000) {
        const container = document.getElementById('alertContainer');
        if (!container) return;

        const alert = document.createElement('div');
        alert.className = `alert ${type}`;
        alert.innerHTML = `${message}<button class="alert-close">&times;</button>`;
        
        alert.querySelector('.alert-close').addEventListener('click', () => this.remove(alert));
        container.appendChild(alert);

        if (duration > 0) {
            setTimeout(() => this.remove(alert), duration);
        }
    }

    static remove(alert) {
        if (!alert || !alert.parentNode) return;
        alert.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => alert.remove(), 300);
    }

    static success(message) { this.show(message, 'success'); }
    static error(message) { this.show(message, 'error', 8000); }
    static info(message) { this.show(message, 'info'); }
}

// --- MAIN APPLICATION LOGIC ---

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    setupStaticEventListeners();
    setTimeout(() => initializeSupabase(), 500);
});

function setupStaticEventListeners() {
    document.getElementById('signoutBtn')?.addEventListener('click', handleDisconnect);
    document.getElementById('retryBtn')?.addEventListener('click', () => {
        appState.updateConnectionStatus('loading', 'Reintentando conexión...');
        initializeSupabase();
    });
    
    // Modal setup
    const modal = document.getElementById('editModal');
    modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.getElementById('closeModal')?.addEventListener('click', closeModal);
    document.getElementById('cancelEdit')?.addEventListener('click', closeModal);
    document.getElementById('editForm')?.addEventListener('submit', saveRecord);
    
    // Filter actions
    document.getElementById('applyFilters')?.addEventListener('click', applyFiltersAndRender);
    document.getElementById('clearFilters')?.addEventListener('click', clearFilters);
    document.getElementById('toggleFiltersBtn')?.addEventListener('click', toggleFilters);

    // Add Record Modal
    document.getElementById('addRecordBtn')?.addEventListener('click', openAddRecordModal);
    document.getElementById('closeAddModal')?.addEventListener('click', closeAddRecordModal);
    document.getElementById('cancelAdd')?.addEventListener('click', closeAddRecordModal);
    document.getElementById('addRecordForm')?.addEventListener('submit', saveNewRecord);

    // Bulk actions
    document.getElementById('bulk-update-btn')?.addEventListener('click', handleBulkUpdate);

    // Export button
    document.getElementById('exportBtn')?.addEventListener('click', exportToExcel);

    // Import CSV
    document.getElementById('importCsvBtn')?.addEventListener('click', () => document.getElementById('csvFileInput').click());
    document.getElementById('csvFileInput')?.addEventListener('change', handleCsvFileSelect);
}

async function initializeSupabase() {
    try {
        console.log('Initializing Supabase connection...');
        appState.updateConnectionStatus('loading', 'Conectando a Supabase...');
        
        const { error } = await supabase.from(CONFIG.TABLE_NAME).select('id', { count: 'exact', head: true });
        if (error) throw new Error(`Error de conexión a Supabase: ${error.message}`);

        appState.isConnected = true;
        appState.updateConnectionStatus('success', 'Conectado a Supabase correctamente');
        console.log('Supabase connection initialized successfully');
        
        await loadSupabaseData();
        AlertManager.success('Conectado exitosamente a Supabase');

    } catch (error) {
        console.error('Error initializing Supabase:', error);
        appState.updateConnectionStatus('error', `Error al conectar: ${error.message}`);
        AlertManager.error(`Error al conectar con Supabase: ${error.message}`);
    }
}

async function loadSupabaseData() {
    try {
        appState.setLoading(true);
        const { data: rows, error } = await supabase.from(CONFIG.TABLE_NAME).select('*').order('id', { ascending: true });
        if (error) throw new Error(`Error cargando datos: ${error.message}`);

        // Standardize data on load
        appState.data = rows.map(row => ({
            ...row,
            id: row.id,
            rowIndex: row.id,
            entidad: (row.entidad || '').trim().toUpperCase(),
            obligacion: (row.obligacion || '').trim().toUpperCase(),
            estado: row.estado || 'Pendiente'
        }));

        console.log(`Loaded ${appState.data.length} records from Supabase`);
        initializeDynamicInterface();
        AlertManager.success(`${appState.data.length} obligaciones cargadas.`);

    } catch (error) {
        console.error('Error loading data from Supabase:', error);
        AlertManager.error('Error al cargar datos de Supabase: ' + error.message);
    } finally {
        appState.setLoading(false);
    }
}

function initializeDynamicInterface() {
    updateFilterControls(appState.data);
    setupDynamicEventListeners();
    applyFiltersAndRender();
    setupCalendar();
}

function setupDynamicEventListeners() {
    const filterGroups = ['empresaFilters', 'entityFilters', 'responsableFilters', 'obligacionFilters', 'statusFilters'];
    filterGroups.forEach(id => {
        document.getElementById(id)?.addEventListener('change', handleFilterChange);
    });

    document.getElementById('yearFilter')?.addEventListener('change', applyFiltersAndRender);
    document.getElementById('monthFilter')?.addEventListener('change', applyFiltersAndRender);
    document.querySelectorAll('.stat-button').forEach(btn => btn.addEventListener('click', handleStatClick));
    document.querySelectorAll('.filter-search').forEach(input => input.addEventListener('input', handleFilterSearch));
}

function handleFilterChange(e) {
    if (e.target.type !== 'checkbox') return;
    
    // If "Select All" is clicked, update its children
    if (e.target.id.includes('_selectAll')) {
        const container = e.target.closest('.filter-checkboxes');
        const isChecked = e.target.checked;
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = isChecked);
    }
    
    applyFiltersAndRender();
}

function handleStatClick(e) {
    const filterType = e.currentTarget.dataset.filter;
    const isActive = e.currentTarget.classList.contains('active');

    document.querySelectorAll('.stat-button').forEach(btn => btn.classList.remove('active'));
    
    if (isActive) {
        appState.activeStatFilter = null;
    } else {
        appState.activeStatFilter = filterType;
        e.currentTarget.classList.add('active');
    }
    applyFiltersAndRender();
}

function applyFiltersAndRender() {
    console.time('FilteringAndRendering');

    const getSelected = (type) => {
        const container = document.getElementById(`${type}Filters`);
        if (!container) return new Set();
        const selected = new Set();
        container.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            if (cb.value) selected.add(cb.value);
        });
        return selected;
    };

    const selectedEmpresas = getSelected('empresa');
    const selectedEntities = getSelected('entity');
    const selectedResponsables = getSelected('responsable');
    const selectedObligaciones = getSelected('obligacion');
    const selectedStatuses = getSelected('status');

    const filtered = appState.data.filter(item => 
        selectedEmpresas.has(item.empresa) &&
        selectedEntities.has(item.entidad) &&
        selectedResponsables.has(item.responsable) &&
        selectedObligaciones.has(item.obligacion) &&
        selectedStatuses.has(item.estado) &&
        (!appState.activeStatFilter || applyStatFilter(item, appState.activeStatFilter))
    );

    appState.filteredData = filtered;
    updateAllFilterControls(filtered);

    // Date filters only apply to the table, not the calendar
    const selectedYear = document.getElementById('yearFilter').value;
    const selectedMonth = document.getElementById('monthFilter').value;

    const tableData = (selectedYear || selectedMonth) 
        ? filtered.filter(item => {
            if (!item.fecha_limite) return false;
            const itemDate = new Date(item.fecha_limite);
            if (isNaN(itemDate)) return false;
            const yearMatch = !selectedYear || itemDate.getFullYear() === parseInt(selectedYear);
            const monthMatch = !selectedMonth || (itemDate.getMonth() + 1) === parseInt(selectedMonth);
            return yearMatch && monthMatch;
        })
        : filtered;

    renderTableWithData(tableData);
    updateCalendar();
    updateStats();
    
    console.timeEnd('FilteringAndRendering');
}

function updateFilterControls(data) {
    const createOptions = (key) => new Set(data.map(item => item[key]).filter(Boolean));

    // Full setup on first load
    createFilterCheckboxes('empresaFilters', createOptions('empresa'), 'empresa');
    createFilterCheckboxes('entityFilters', createOptions('entidad'), 'entity');
    createFilterCheckboxes('responsableFilters', createOptions('responsable'), 'responsable');
    createFilterCheckboxes('obligacionFilters', createOptions('obligacion'), 'obligacion');
    createFilterCheckboxes('statusFilters', createOptions('estado'), 'status');
    
    const years = new Set(appState.data.map(item => item.fecha_limite ? new Date(item.fecha_limite).getFullYear() : null).filter(Boolean));
    const yearFilter = document.getElementById('yearFilter');
    Array.from(years).sort().forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearFilter.appendChild(option);
    });
}

function updateCheckboxVisibility(containerId, availableOptions, selectedOptions) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.filter-checkbox input[value]').forEach(cb => {
        const shouldBeVisible = availableOptions.has(cb.value);
        cb.parentElement.style.display = shouldBeVisible ? '' : 'none';
        if (shouldBeVisible && !selectedOptions.has(cb.value)) {
            // cb.checked = false; // Optional: uncheck filters that are no longer relevant
        }
    });
}

function updateAllFilterControls(filteredData) {
    const filterKeys = ['empresa', 'entidad', 'responsable', 'obligacion', 'estado'];
    
    filterKeys.forEach(key => {
        const selected = getSelectedFilters(key);
        const availableOptions = new Set(filteredData.map(item => item[key]).filter(Boolean));
        updateCheckboxVisibility(`${key}Filters`, availableOptions, selected);
    });
}

function createFilterCheckboxes(containerId, items, filterType) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const fragment = document.createDocumentFragment();
    
    const selectAllDiv = document.createElement('div');
    selectAllDiv.className = 'filter-checkbox';
    selectAllDiv.innerHTML = `<input type="checkbox" id="${filterType}_selectAll" checked><label for="${filterType}_selectAll" style="font-weight: bold;">Seleccionar Todo</label>`;
    fragment.appendChild(selectAllDiv);

    Array.from(items).sort().forEach(item => {
        const div = document.createElement('div');
        div.className = 'filter-checkbox';
        div.innerHTML = `<input type="checkbox" id="${filterType}_${item.replace(/[^a-zA-Z0-9]/g, '_')}" value="${item}" checked><label for="${filterType}_${item.replace(/[^a-zA-Z0-9]/g, '_')}">${item}</label>`;
        fragment.appendChild(div);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
}

function renderTableWithData(data) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    const fragment = document.createDocumentFragment();
    data.forEach(item => {
        const row = document.createElement('tr');
        row.dataset.rowId = item.id;
        row.innerHTML = `
            <td><input type="checkbox" class="row-checkbox" data-id="${item.id}"></td>
            <td>${item.abreviatura}</td>
            <td>${item.entidad}</td>
            <td>${item.obligacion}</td>
            <td>${item.periodo}</td>
            <td>${new Date(item.fecha_limite).toLocaleDateString('es-ES')}</td>
            <td class="status-cell"><span class="status status--${(item.estado || '').toLowerCase()}">${item.estado}</span></td>
            <td class="table-actions">
                <button class="btn btn--sm btn--outline btn-icon" onclick="editRecord(${item.rowIndex})">✏️</button>
                <button class="btn btn--sm btn--outline btn-icon" onclick="deleteRecord(${item.id})">🗑️</button>
            </td>
        `;
        fragment.appendChild(row);
    });

    tbody.innerHTML = '';
    tbody.appendChild(fragment);
    
    // Add listeners for new checkboxes
    tbody.querySelectorAll('.row-checkbox').forEach(cb => cb.addEventListener('change', handleRowSelection));
    document.getElementById('selectAllRows').addEventListener('change', handleSelectAllRows);
}

function handleRowSelection() {
    appState.selectedRows.clear();
    document.querySelectorAll('.row-checkbox:checked').forEach(cb => {
        appState.selectedRows.add(parseInt(cb.dataset.id));
    });
    
    const bulkActions = document.getElementById('bulk-actions-container');
    bulkActions.classList.toggle('hidden', appState.selectedRows.size === 0);
    
    document.getElementById('selectAllRows').checked = (appState.selectedRows.size === document.querySelectorAll('.row-checkbox').length && appState.selectedRows.size > 0);
}

function handleSelectAllRows(e) {
    const isChecked = e.target.checked;
    document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = isChecked);
    handleRowSelection();
}

async function handleBulkUpdate() {
    const newStatus = document.getElementById('bulk-status-select').value;
    const idsToUpdate = Array.from(appState.selectedRows);

    if (idsToUpdate.length === 0) {
        return AlertManager.warning('No hay filas seleccionadas para actualizar.');
    }

    appState.setLoading(true);
    try {
        const { error } = await supabase.from(CONFIG.TABLE_NAME).update({ estado: newStatus }).in('id', idsToUpdate);
        if (error) throw error;

        // Update local state
        appState.data.forEach(item => {
            if (idsToUpdate.includes(item.id)) {
                item.estado = newStatus;
            }
        });
        
        applyFiltersAndRender(); // Re-render everything with the new state
        AlertManager.success(`${idsToUpdate.length} registros actualizados a "${newStatus}".`);

    } catch (error) {
        console.error('Error during bulk update:', error);
        AlertManager.error(`Error al actualizar: ${error.message}`);
    } finally {
        appState.setLoading(false);
        appState.selectedRows.clear();
        document.getElementById('selectAllRows').checked = false;
    }
}

// Other functions (Calendar, Stats, etc. - minor changes for new flow)
function setupCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl || typeof FullCalendar === 'undefined') return;
    
    if (appState.calendar) appState.calendar.destroy();
    
    appState.calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listWeek' },
        locale: 'es',
        events: getCalendarEvents(),
        eventClick: (info) => editRecord(parseInt(info.event.extendedProps.rowIndex)),
        height: 'auto'
    });
    appState.calendar.render();
}

function updateCalendar() {
    if (appState.calendar) {
        appState.calendar.removeAllEvents();
        appState.calendar.addEventSource(getCalendarEvents());
    }
}

function getCalendarEvents() {
    // Uses appState.filteredData, which is NOT filtered by date
    return appState.filteredData.map(item => ({
        title: `${item.abreviatura} – ${item.entidad} – ${item.obligacion}`,
        date: item.fecha_limite,
        color: getEventColor(item.estado, item.fecha_limite),
        extendedProps: { rowIndex: item.rowIndex }
    }));
}

function updateStats() {
    // Stats are based on the currently filtered data (pre-date filter)
    const data = appState.filteredData;
    document.getElementById('totalCount').textContent = data.length;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const upcoming = data.filter(item => {
        if (!item.fecha_limite || item.estado === 'Completado') return false;
        const diff = new Date(item.fecha_limite) - today;
        return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
    }).length;
    
    const overdue = data.filter(item => {
        if (!item.fecha_limite || item.estado === 'Completado') return false;
        return new Date(item.fecha_limite) < today;
    }).length;

    document.getElementById('upcomingCount').textContent = upcoming;
    document.getElementById('overdueCount').textContent = overdue;
}

// Helper functions (unchanged or minor tweaks)
function getSelectedFilters(filterType) {
    const selected = new Set();
    document.querySelectorAll(`input[id*="${filterType}_"]:checked`).forEach(cb => {
        if(cb.value) selected.add(cb.value);
    });
    return selected;
}

function applyStatFilter(item, filterType) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!item.fecha_limite || item.estado === 'Completado') return filterType === 'total';

    const dueDate = new Date(item.fecha_limite);
    switch (filterType) {
        case 'upcoming': return dueDate >= today && (dueDate - today) <= 7 * 24 * 60 * 60 * 1000;
        case 'overdue': return dueDate < today;
        default: return true;
    }
}

function getEventColor(status, dueDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (status === 'Presentado') {
        return 'green';
    }
    if (status === 'No Aplica') {
        return 'gray';
    }

    if (status === 'Pendiente') {
        if (!dueDateStr) {
            return 'blue';
        }
        const dueDate = new Date(dueDateStr);
        const diffDays = (dueDate - today) / (1000 * 60 * 60 * 24);

        if (diffDays < 0) {
            return 'red';
        }
        if (diffDays <= 30) {
            return 'orange';
        }
        return 'blue';
    }

    return 'blue';
}

// Edit Modal Logic (largely unchanged)
window.editRecord = function(rowIndex) {
    const record = appState.data.find(item => item.rowIndex === rowIndex);
    if (!record) return AlertManager.error('Registro no encontrado');

    appState.currentEditingRow = rowIndex;
    document.getElementById('editAbreviatura').value = record.abreviatura || '';
    document.getElementById('editEntity').value = record.entidad || '';
    document.getElementById('editObligacion').value = record.obligacion || '';
    document.getElementById('editPeriodo').value = record.periodo || '';
    document.getElementById('editFechaLimite').value = record.fecha_limite || '';
    document.getElementById('editStatus').value = record.estado || 'Pendiente';
    document.getElementById('editModal').classList.remove('hidden');
};

function closeModal() {
    document.getElementById('editModal').classList.add('hidden');
    appState.currentEditingRow = null;
}

async function saveRecord(e) {
    e.preventDefault();
    if (!appState.currentEditingRow) return;

    appState.setLoading(true);
    try {
        const updatedData = {
            fecha_limite: document.getElementById('editFechaLimite').value,
            estado: document.getElementById('editStatus').value
        };
        
        const record = appState.data.find(item => item.rowIndex === appState.currentEditingRow);
        await safeSupabaseUpdate({ ...record, ...updatedData });

        const recordIndex = appState.data.findIndex(item => item.rowIndex === appState.currentEditingRow);
        if (recordIndex !== -1) {
            Object.assign(appState.data[recordIndex], updatedData);
        }
        
        applyFiltersAndRender();
        closeModal();
        AlertManager.success('Registro actualizado exitosamente');

    } catch (error) {
        AlertManager.error(`Error al guardar: ${error.message}`);
    } finally {
        appState.setLoading(false);
    }
}

async function safeSupabaseUpdate(data) {
    const { error } = await supabase
        .from(CONFIG.TABLE_NAME)
        .update({
            fecha_limite: data.fecha_limite,
            estado: data.estado
        })
        .eq('id', data.id);
    if (error) throw new Error(`Error actualizando en Supabase: ${error.message}`);
}

// Disconnect and other helpers
function handleConnect() {
    appState.setLoading(true);
    initializeSupabase();
}

function handleDisconnect() {
    appState.isConnected = false;
    appState.data = [];
    appState.filteredData = [];
    document.getElementById('signoutBtn').classList.add('hidden');
    appState.updateConnectionStatus('info', 'Desconectado de Supabase');
    AlertManager.info('Conexión cerrada.');
    // Clear interface
    document.getElementById('tableBody').innerHTML = '';
    if(appState.calendar) appState.calendar.removeAllEvents();
}

function clearFilters() {
    document.querySelectorAll('.filter-checkbox input[type="checkbox"]').forEach(cb => cb.checked = true);
    document.querySelectorAll('.filter-search').forEach(input => input.value = '');
    document.getElementById('yearFilter').value = '';
    document.getElementById('monthFilter').value = '';
    if (appState.activeStatFilter) {
        document.querySelector('.stat-button.active')?.classList.remove('active');
        appState.activeStatFilter = null;
    }
    applyFiltersAndRender();
}

function toggleFilters() {
    const filtersSection = document.querySelector('.filters-section');
    const toggleBtn = document.getElementById('toggleFiltersBtn');
    filtersSection.classList.toggle('collapsed');
    const isCollapsed = filtersSection.classList.contains('collapsed');
    toggleBtn.textContent = isCollapsed ? 'Mostrar' : 'Ocultar';
}

function handleFilterSearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    const filterContainer = e.target.nextElementSibling;
    const checkboxes = filterContainer.querySelectorAll('.filter-checkbox');
    checkboxes.forEach(cb => {
        const label = cb.querySelector('label').textContent.toLowerCase();
        if (label.includes(searchTerm)) {
            cb.style.display = '';
        } else {
            cb.style.display = 'none';
        }
    });
}

function openAddRecordModal() {
    document.getElementById('addRecordModal').classList.remove('hidden');
}

function closeAddRecordModal() {
    document.getElementById('addRecordModal').classList.add('hidden');
    document.getElementById('addRecordForm').reset();
}

async function saveNewRecord(e) {
    e.preventDefault();

    const newRecord = {
        abreviatura: document.getElementById('addAbreviatura').value,
        empresa: document.getElementById('addEmpresa').value,
        entidad: document.getElementById('addEntity').value,
        responsable: document.getElementById('addResponsable').value,
        obligacion: document.getElementById('addObligacion').value,
        periodo: document.getElementById('addPeriodo').value,
        fecha_limite: document.getElementById('addFechaLimite').value,
        estado: document.getElementById('addStatus').value,
        predeterminado: document.getElementById('addPredeterminado').checked,
    };

    appState.setLoading(true);
    try {
        const { data, error } = await supabase.from(CONFIG.TABLE_NAME).insert([newRecord]).select();
        if (error) throw error;

        appState.data.push(data[0]);
        applyFiltersAndRender();
        closeAddRecordModal();
        AlertManager.success('Registro agregado exitosamente');
    } catch (error) {
        AlertManager.error(`Error al guardar: ${error.message}`);
    } finally {
        appState.setLoading(false);
    }
}

async function exportToExcel() {
    appState.setLoading(true);
    try {
        const { data: allData, error } = await supabase.from(CONFIG.TABLE_NAME).select('*');
        if (error) throw error;

        const worksheet = XLSX.utils.json_to_sheet(allData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Obligaciones Tributarias");
        XLSX.writeFile(workbook, "obligaciones_tributarias.xlsx");
        AlertManager.success('Datos exportados a Excel exitosamente!');
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        AlertManager.error(`Error al exportar a Excel: ${error.message}`);
    } finally {
        appState.setLoading(false);
    }
}

async function handleCsvFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    appState.setLoading(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);

            // Upload to Supabase
            const { error } = await supabase.from(CONFIG.TABLE_NAME).insert(json);
            if (error) throw error;

            AlertManager.success('Datos importados exitosamente desde CSV!');
            await loadSupabaseData(); // Reload data to update UI
        } catch (error) {
            console.error('Error importing CSV:', error);
            AlertManager.error(`Error al importar CSV: ${error.message}`);
        } finally {
            appState.setLoading(false);
            event.target.value = ''; // Clear the input
        }
    };

    reader.readAsArrayBuffer(file);
}

window.deleteRecord = async function(id) {
    if (!confirm('¿Estás seguro de que quieres eliminar este registro?')) {
        return;
    }

    appState.setLoading(true);
    try {
        const { error } = await supabase.from(CONFIG.TABLE_NAME).delete().eq('id', id);
        if (error) throw error;

        appState.data = appState.data.filter(item => item.id !== id);
        applyFiltersAndRender();
        AlertManager.success('Registro eliminado exitosamente!');
    } catch (error) {
        console.error('Error deleting record:', error);
        AlertManager.error(`Error al eliminar registro: ${error.message}`);
    } finally {
        appState.setLoading(false);
    }
}