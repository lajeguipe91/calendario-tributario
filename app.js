// Google Sheets Tax Calendar Application - Fixed Version with DATA sheet and OAuth fixes
// Production Configuration with corrected sheet name
const CONFIG = {
    API_KEY: 'AIzaSyBdlizVp_hOembaoFJYE_rKHCvFtn9asok',
    CLIENT_ID: '341125602004-36tl0jfhtd7ce21csjun41fel085res8.apps.googleusercontent.com',
    SPREADSHEET_ID: '10L6aSKz8oPtq4ZpXcO921vCIciHWlCRqo_w5pAHc3yo',
    DISCOVERY_DOC: 'https://sheets.googleapis.com/$discovery/rest?version=v4',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
    // CRITICAL FIX: Updated possible sheet names with DATA as primary
    POSSIBLE_SHEET_NAMES: ['DATA', 'Calendario', 'Sheet1', 'Hoja1', 'CALENDARIO OBLIGACIONES HOLDING'],
    CURRENT_SHEET_NAME: 'DATA', // Default to DATA
    RANGE: 'DATA!A:J' // Default range using DATA sheet
};

// Global State Management
class AppState {
    constructor() {
        this.isSignedIn = false;
        this.gsiInited = false;
        this.gapiInited = false;
        this.isLoading = false;
        this.data = [];
        this.filteredData = [];
        this.filters = {
            entities: new Set(),
            types: new Set(),
            statuses: new Set()
        };
        this.calendar = null;
        this.currentEditingRow = null;
        this.initializationAttempts = 0;
        this.maxInitAttempts = 3;
        this.detectedSheetName = null;
        this.tokenClient = null;
    }

    setLoading(loading) {
        this.isLoading = loading;
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            if (loading) {
                overlay.classList.remove('hidden');
            } else {
                overlay.classList.add('hidden');
            }
        }
    }

    updateConnectionStatus(status, message) {
        const banner = document.getElementById('connectionStatus');
        const icon = document.getElementById('statusIcon');
        const text = document.getElementById('statusText');
        const retryBtn = document.getElementById('retryBtn');

        if (banner && icon && text) {
            banner.className = `connection-status ${status}`;
            banner.classList.remove('hidden');
            
            switch (status) {
                case 'success':
                    icon.textContent = '✅';
                    if (retryBtn) retryBtn.classList.add('hidden');
                    break;
                case 'error':
                    icon.textContent = '❌';
                    if (retryBtn) retryBtn.classList.remove('hidden');
                    break;
                default:
                    icon.textContent = '⚠️';
                    if (retryBtn) retryBtn.classList.add('hidden');
            }
            
            text.textContent = message;
        }
    }
}

// Global state instance
const appState = new AppState();

// Alert System
class AlertManager {
    static show(message, type = 'info', duration = 5000) {
        const container = document.getElementById('alertContainer');
        if (!container) return;

        const alert = document.createElement('div');
        alert.className = `alert ${type}`;
        alert.innerHTML = `
            ${message}
            <button class="alert-close">&times;</button>
        `;

        const closeBtn = alert.querySelector('.alert-close');
        closeBtn.addEventListener('click', () => this.remove(alert));

        container.appendChild(alert);

        if (duration > 0) {
            setTimeout(() => this.remove(alert), duration);
        }
    }

    static remove(alert) {
        if (alert && alert.parentNode) {
            alert.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => {
                if (alert.parentNode) {
                    alert.parentNode.removeChild(alert);
                }
            }, 300);
        }
    }

    static success(message) {
        this.show(message, 'success');
    }

    static error(message) {
        this.show(message, 'error', 8000);
    }

    static warning(message) {
        this.show(message, 'warning');
    }

    static info(message) {
        this.show(message, 'info');
    }
}

// Wait for Google APIs to load
function waitForGoogleAPI() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 100; // 10 seconds
        
        const checkAPI = () => {
            attempts++;
            if (typeof gapi !== 'undefined' && gapi.load) {
                resolve();
            } else if (attempts >= maxAttempts) {
                reject(new Error('Google API no se cargó'));
            } else {
                setTimeout(checkAPI, 100);
            }
        };
        
        checkAPI();
    });
}

// Wait for Google GSI to load
function waitForGoogleGSI() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 100; // 10 seconds
        
        const checkGSI = () => {
            attempts++;
            if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
                resolve();
            } else if (attempts >= maxAttempts) {
                reject(new Error('Google GSI no se cargó'));
            } else {
                setTimeout(checkGSI, 100);
            }
        };
        
        checkGSI();
    });
}

// FIXED: Google APIs Initialization with better error handling and OAuth setup
async function initializeGoogleAPIs() {
    try {
        console.log('Initializing Google APIs... Attempt:', appState.initializationAttempts + 1);
        appState.initializationAttempts++;
        appState.updateConnectionStatus('loading', 'Inicializando APIs de Google...');

        // Check if we've exceeded max attempts
        if (appState.initializationAttempts > appState.maxInitAttempts) {
            throw new Error('Se agotaron los intentos de conexión');
        }

        // Wait for Google API to be available
        await waitForGoogleAPI();
        console.log('Google API disponible');

        // Initialize gapi client
        await new Promise((resolve, reject) => {
            gapi.load('client', {
                callback: resolve,
                onerror: reject
            });
        });

        await gapi.client.init({
            apiKey: CONFIG.API_KEY,
            discoveryDocs: [CONFIG.DISCOVERY_DOC],
        });

        appState.gapiInited = true;
        console.log('GAPI initialized successfully');

        // Wait for Google GSI to be available
        try {
            await waitForGoogleGSI();
            console.log('Google GSI disponible');

            // FIXED: Initialize OAuth2 token client properly
            appState.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CONFIG.CLIENT_ID,
                scope: CONFIG.SCOPES,
                prompt: '', // Don't always show consent screen
                callback: handleOAuthCallback,
                error_callback: handleOAuthError
            });

            appState.gsiInited = true;
            console.log('GSI initialized successfully');
        } catch (gsiError) {
            console.warn('GSI initialization failed:', gsiError);
            appState.gsiInited = false;
        }

        appState.updateConnectionStatus('success', 'APIs de Google inicializadas correctamente');
        setupAuthButton();
        
        // Load demo data immediately to show something
        loadDemoData();

    } catch (error) {
        console.error('Error initializing Google APIs:', error);
        appState.updateConnectionStatus('error', `Error al inicializar: ${error.message}`);
        AlertManager.error(`Error al conectar con Google: ${error.message}`);
        
        // Load demo data as fallback
        setupAuthButton();
        loadDemoData();
    }
}

// FIXED: OAuth callback handler
async function handleOAuthCallback(response) {
    try {
        console.log('OAuth callback received:', response);
        
        if (response.error) {
            throw new Error('OAuth error: ' + response.error);
        }

        if (!response.access_token) {
            throw new Error('No se recibió token de acceso');
        }

        // Set the access token for gapi client
        gapi.client.setToken({
            access_token: response.access_token
        });

        appState.isSignedIn = true;
        updateAuthUI();
        appState.updateConnectionStatus('success', 'Conectado a Google Sheets');
        
        // Load spreadsheet data
        await loadSpreadsheetData();
        AlertManager.success('Conectado exitosamente a Google Sheets');
        
    } catch (error) {
        console.error('OAuth callback error:', error);
        appState.isSignedIn = false;
        updateAuthUI();
        appState.updateConnectionStatus('error', 'Error de autorización');
        AlertManager.error('Error en la autorización: ' + error.message);
    } finally {
        appState.setLoading(false);
    }
}

// FIXED: OAuth error handler
function handleOAuthError(error) {
    console.error('OAuth error:', error);
    appState.setLoading(false);
    appState.isSignedIn = false;
    updateAuthUI();
    
    if (error.type === 'popup_closed') {
        appState.updateConnectionStatus('error', 'Ventana de autenticación cerrada');
        AlertManager.warning('Ventana de autenticación cerrada. Inténtalo de nuevo.');
    } else {
        appState.updateConnectionStatus('error', 'Error de autorización');
        AlertManager.error('Error en la autorización. Usando datos de demostración.');
    }
}

// Setup auth button
function setupAuthButton() {
    const authBtn = document.getElementById('authBtn');
    const signoutBtn = document.getElementById('signoutBtn');
    const retryBtn = document.getElementById('retryBtn');

    if (authBtn) {
        authBtn.addEventListener('click', handleAuthClick);
    }
    if (signoutBtn) {
        signoutBtn.addEventListener('click', handleSignoutClick);
    }
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            appState.updateConnectionStatus('loading', 'Reintentando conexión...');
            appState.initializationAttempts = 0; // Reset attempts
            initializeGoogleAPIs();
        });
    }

    updateAuthUI();
}

// FIXED: Handle authorization with better error handling
async function handleAuthClick() {
    if (!appState.gapiInited) {
        AlertManager.error('Las APIs de Google no están inicializadas');
        return;
    }

    if (!appState.tokenClient) {
        AlertManager.error('Cliente OAuth no está inicializado');
        return;
    }

    try {
        appState.setLoading(true);
        appState.updateConnectionStatus('loading', 'Autenticando...');

        // FIXED: Request access token with proper error handling
        console.log('Requesting access token...');
        appState.tokenClient.requestAccessToken();
        
        // Note: The actual handling is done in the callback functions
        
    } catch (error) {
        console.error('Auth click error:', error);
        appState.setLoading(false);
        appState.updateConnectionStatus('error', 'Error de autenticación');
        AlertManager.error('Error de autenticación: ' + error.message);
    }
}

// Handle signout
function handleSignoutClick() {
    try {
        const token = gapi.client.getToken();
        if (token !== null) {
            google.accounts.oauth2.revoke(token.access_token, () => {
                console.log('Token revoked');
            });
            gapi.client.setToken('');
        }
    } catch (error) {
        console.warn('Error during signout:', error);
    }
    
    appState.isSignedIn = false;
    appState.data = [];
    appState.filteredData = [];
    appState.detectedSheetName = null;
    
    updateAuthUI();
    clearAllData();
    loadDemoData(); // Load demo data after signout
    appState.updateConnectionStatus('info', 'Desconectado de Google Sheets');
    AlertManager.info('Sesión cerrada. Mostrando datos de demostración.');
}

// Update auth UI
function updateAuthUI() {
    const authBtn = document.getElementById('authBtn');
    const authText = document.getElementById('authText');
    const signoutBtn = document.getElementById('signoutBtn');

    if (authBtn && signoutBtn) {
        if (appState.isSignedIn) {
            authBtn.classList.add('hidden');
            signoutBtn.classList.remove('hidden');
        } else {
            authBtn.classList.remove('hidden');
            signoutBtn.classList.add('hidden');
            if (authText) authText.textContent = 'Conectar a Google';
        }
    }
}

// CRITICAL FIX: Detect correct sheet name and load data
async function loadSpreadsheetData() {
    try {
        console.log('Loading spreadsheet data...');
        appState.setLoading(true);
        appState.updateConnectionStatus('loading', 'Detectando hoja de cálculo...');

        let response = null;
        let successfulSheetName = null;

        // Try each possible sheet name
        for (const sheetName of CONFIG.POSSIBLE_SHEET_NAMES) {
            try {
                console.log(`Trying sheet name: ${sheetName}`);
                appState.updateConnectionStatus('loading', `Probando hoja: ${sheetName}...`);

                const range = `${sheetName}!A:J`;
                response = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: CONFIG.SPREADSHEET_ID,
                    range: range,
                });

                if (response && response.result && response.result.values) {
                    successfulSheetName = sheetName;
                    appState.detectedSheetName = sheetName;
                    CONFIG.CURRENT_SHEET_NAME = sheetName;
                    CONFIG.RANGE = range;
                    console.log(`Successfully connected to sheet: ${sheetName}`);
                    break;
                }
            } catch (sheetError) {
                console.log(`Failed to load from sheet ${sheetName}:`, sheetError.result?.error?.message || sheetError.message);
                continue;
            }
        }

        if (!response || !successfulSheetName) {
            throw new Error('No se pudo encontrar ninguna hoja válida en el documento');
        }

        const rows = response.result.values;
        if (!rows || rows.length === 0) {
            throw new Error(`No se encontraron datos en la hoja ${successfulSheetName}`);
        }

        // Process data (skip header row)
        const headers = rows[0];
        appState.data = rows.slice(1).map((row, index) => ({
            rowIndex: index + 2, // +2 because we skip header and arrays are 0-indexed
            entity: row[0] || '',
            type: row[1] || '',
            description: row[2] || '',
            dueDate: row[3] || '',
            status: row[4] || 'Pendiente',
            notes: row[5] || '',
            priority: row[6] || 'Media',
            amount: row[7] || '',
            responsible: row[8] || '',
            completedDate: row[9] || ''
        }));

        console.log(`Loaded ${appState.data.length} records from sheet: ${successfulSheetName}`);
        appState.filteredData = [...appState.data];
        
        initializeInterface();
        appState.updateConnectionStatus('success', `Conectado a hoja: ${successfulSheetName}`);
        AlertManager.success(`${appState.data.length} obligaciones cargadas desde la hoja ${successfulSheetName}`);

    } catch (error) {
        console.error('Error loading data:', error);
        const errorMessage = error.result?.error?.message || error.message;
        appState.updateConnectionStatus('error', `Error cargando datos: ${errorMessage}`);
        AlertManager.error('Error al cargar datos de Google Sheets: ' + errorMessage + '. Usando datos de demostración.');
        
        // Load demo data as fallback
        loadDemoData();
    } finally {
        appState.setLoading(false);
    }
}

// Load demo data as fallback
function loadDemoData() {
    console.log('Loading demo data...');
    
    appState.data = [
        {
            rowIndex: 2,
            entity: 'SUNAT',
            type: 'IGV',
            description: 'Declaración mensual de IGV',
            dueDate: '2025-01-12',
            status: 'Pendiente',
            notes: 'Revisar facturas del mes anterior',
            priority: 'Alta',
            amount: '15000',
            responsible: 'Contador',
            completedDate: ''
        },
        {
            rowIndex: 3,
            entity: 'SUNAT',
            type: 'Renta',
            description: 'Pago a cuenta de Impuesto a la Renta',
            dueDate: '2025-01-12',
            status: 'En Proceso',
            notes: 'En preparación',
            priority: 'Alta',
            amount: '8500',
            responsible: 'Gerencia',
            completedDate: ''
        },
        {
            rowIndex: 4,
            entity: 'ESSALUD',
            type: 'Contribuciones',
            description: 'Declaración y pago de contribuciones',
            dueDate: '2025-01-15',
            status: 'Pendiente',
            notes: 'Incluir nuevos empleados',
            priority: 'Alta',
            amount: '3200',
            responsible: 'RRHH',
            completedDate: ''
        },
        {
            rowIndex: 5,
            entity: 'SUNAT',
            type: 'PDT',
            description: 'Presentación de PDT 621',
            dueDate: '2025-01-17',
            status: 'Completado',
            notes: 'Presentado correctamente',
            priority: 'Media',
            amount: '2500',
            responsible: 'Contador',
            completedDate: '2025-01-16'
        },
        {
            rowIndex: 6,
            entity: 'Municipalidad',
            type: 'Licencias',
            description: 'Renovación de licencia municipal',
            dueDate: '2025-01-20',
            status: 'Vencido',
            notes: 'Pendiente de documentos',
            priority: 'Crítica',
            amount: '850',
            responsible: 'Legal',
            completedDate: ''
        }
    ];

    appState.filteredData = [...appState.data];
    initializeInterface();
    
    if (!appState.isSignedIn) {
        AlertManager.warning('Usando datos de demostración. Conéctate a Google Sheets para datos reales.');
    }
    appState.setLoading(false);
}

// Initialize interface components
function initializeInterface() {
    setupFilters();
    renderTable();
    setupCalendar();
    updateStats();
}

// Setup filters
function setupFilters() {
    const entities = new Set();
    const types = new Set();
    const statuses = new Set();

    appState.data.forEach(item => {
        if (item.entity) entities.add(item.entity);
        if (item.type) types.add(item.type);
        if (item.status) statuses.add(item.status);
    });

    createFilterCheckboxes('entityFilters', entities, 'entities');
    createFilterCheckboxes('typeFilters', types, 'types');
    createFilterCheckboxes('statusFilters', statuses, 'statuses');

    setupFilterSearch();
    setupFilterActions();
}

// Create filter checkboxes
function createFilterCheckboxes(containerId, items, filterType) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';

    Array.from(items).sort().forEach(item => {
        const div = document.createElement('div');
        div.className = 'filter-checkbox';
        div.innerHTML = `
            <input type="checkbox" id="${filterType}_${item.replace(/\s+/g, '_')}" value="${item}" checked>
            <label for="${filterType}_${item.replace(/\s+/g, '_')}">${item}</label>
        `;
        
        const checkbox = div.querySelector('input');
        checkbox.addEventListener('change', applyFilters);
        
        container.appendChild(div);
    });
}

// Setup filter search
function setupFilterSearch() {
    const entitySearch = document.getElementById('entitySearch');
    const typeSearch = document.getElementById('typeSearch');

    if (entitySearch) {
        entitySearch.addEventListener('input', (e) => filterCheckboxes('entityFilters', e.target.value));
    }
    if (typeSearch) {
        typeSearch.addEventListener('input', (e) => filterCheckboxes('typeFilters', e.target.value));
    }
}

// Filter checkboxes based on search
function filterCheckboxes(containerId, searchTerm) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('.filter-checkbox');
    
    checkboxes.forEach(checkbox => {
        const label = checkbox.querySelector('label').textContent.toLowerCase();
        const isVisible = label.includes(searchTerm.toLowerCase());
        checkbox.style.display = isVisible ? 'flex' : 'none';
    });
}

// Setup filter actions
function setupFilterActions() {
    const clearBtn = document.getElementById('clearFilters');
    const applyBtn = document.getElementById('applyFilters');

    if (clearBtn) {
        clearBtn.addEventListener('click', clearFilters);
    }
    if (applyBtn) {
        applyBtn.addEventListener('click', applyFilters);
    }
}

// Clear all filters
function clearFilters() {
    document.querySelectorAll('.filter-checkbox input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = true;
    });
    document.querySelectorAll('.filter-search').forEach(search => {
        search.value = '';
    });
    
    // Reset filter visibility
    document.querySelectorAll('.filter-checkbox').forEach(checkbox => {
        checkbox.style.display = 'flex';
    });
    
    applyFilters();
}

// Apply filters
function applyFilters() {
    const selectedEntities = getSelectedFilters('entities');
    const selectedTypes = getSelectedFilters('types');
    const selectedStatuses = getSelectedFilters('statuses');

    appState.filteredData = appState.data.filter(item => {
        return selectedEntities.has(item.entity) &&
               selectedTypes.has(item.type) &&
               selectedStatuses.has(item.status);
    });

    renderTable();
    updateCalendar();
    updateStats();
}

// Get selected filters
function getSelectedFilters(filterType) {
    const selected = new Set();
    document.querySelectorAll(`input[id^="${filterType}_"]:checked`).forEach(checkbox => {
        selected.add(checkbox.value);
    });
    return selected;
}

// Render table
function renderTable() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';

    appState.filteredData.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.entity}</td>
            <td>${item.type}</td>
            <td>${item.description}</td>
            <td>${formatDate(item.dueDate)}</td>
            <td class="status-cell">
                <span class="status status--${getStatusClass(item.status)}">${item.status}</span>
            </td>
            <td>${item.notes}</td>
            <td class="table-actions">
                <button class="btn btn--sm btn--outline btn-icon" onclick="editRecord(${item.rowIndex})" title="Editar">
                    ✏️
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Format date for display
function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-ES');
    } catch {
        return dateString;
    }
}

// Get status CSS class
function getStatusClass(status) {
    switch (status?.toLowerCase()) {
        case 'completado': return 'success';
        case 'vencido': return 'error';
        case 'en proceso': return 'warning';
        default: return 'info';
    }
}

// Setup calendar
function setupCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl || typeof FullCalendar === 'undefined') return;
    
    if (appState.calendar) {
        appState.calendar.destroy();
    }
    
    appState.calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,listWeek'
        },
        locale: 'es',
        events: getCalendarEvents(),
        eventClick: function(info) {
            const rowIndex = parseInt(info.event.extendedProps.rowIndex);
            editRecord(rowIndex);
        },
        height: 'auto'
    });

    appState.calendar.render();
}

// Update calendar
function updateCalendar() {
    if (appState.calendar) {
        appState.calendar.removeAllEvents();
        appState.calendar.addEventSource(getCalendarEvents());
    }
}

// Get calendar events
function getCalendarEvents() {
    return appState.filteredData.map(item => ({
        title: `${item.entity} - ${item.type}`,
        date: item.dueDate,
        color: getEventColor(item.status),
        extendedProps: {
            rowIndex: item.rowIndex,
            description: item.description,
            status: item.status
        }
    }));
}

// Get event color based on status
function getEventColor(status) {
    switch (status?.toLowerCase()) {
        case 'completado': return '#21805C'; // success color
        case 'vencido': return '#C0152F'; // error color
        case 'en proceso': return '#A84B2F'; // warning color
        default: return '#626C71'; // info color
    }
}

// Update stats
function updateStats() {
    const totalEl = document.getElementById('totalCount');
    const upcomingEl = document.getElementById('upcomingCount');
    const overdueEl = document.getElementById('overdueCount');
    
    if (!totalEl || !upcomingEl || !overdueEl) return;

    const total = appState.filteredData.length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const upcoming = appState.filteredData.filter(item => {
        if (!item.dueDate) return false;
        const dueDate = new Date(item.dueDate);
        const diffTime = dueDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 7 && item.status !== 'Completado';
    }).length;
    
    const overdue = appState.filteredData.filter(item => {
        if (!item.dueDate) return false;
        const dueDate = new Date(item.dueDate);
        return dueDate < today && item.status !== 'Completado';
    }).length;

    totalEl.textContent = total;
    upcomingEl.textContent = upcoming;
    overdueEl.textContent = overdue;
}

// Edit record
window.editRecord = function(rowIndex) {
    const record = appState.data.find(item => item.rowIndex === rowIndex);
    if (!record) {
        AlertManager.error('Registro no encontrado');
        return;
    }

    appState.currentEditingRow = rowIndex;
    
    // Populate modal
    const fields = ['editEntity', 'editType', 'editDescription', 'editDueDate', 'editStatus', 'editNotes'];
    const values = [record.entity, record.type, record.description, record.dueDate, record.status, record.notes];
    
    fields.forEach((fieldId, index) => {
        const field = document.getElementById(fieldId);
        if (field) field.value = values[index];
    });

    // Show modal
    const modal = document.getElementById('editModal');
    if (modal) modal.classList.remove('hidden');
};

// Setup modal
function setupModal() {
    const modal = document.getElementById('editModal');
    const closeBtn = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelEdit');
    const form = document.getElementById('editForm');

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    if (form) form.addEventListener('submit', saveRecord);
}

// Close modal
function closeModal() {
    const modal = document.getElementById('editModal');
    if (modal) modal.classList.add('hidden');
    appState.currentEditingRow = null;
}

// Save record with correct sheet name
async function saveRecord(e) {
    e.preventDefault();
    
    if (!appState.currentEditingRow) {
        AlertManager.error('No hay registro seleccionado para editar');
        return;
    }

    try {
        appState.setLoading(true);

        const updatedData = {
            entity: document.getElementById('editEntity')?.value || '',
            type: document.getElementById('editType')?.value || '',
            description: document.getElementById('editDescription')?.value || '',
            dueDate: document.getElementById('editDueDate')?.value || '',
            status: document.getElementById('editStatus')?.value || 'Pendiente',
            notes: document.getElementById('editNotes')?.value || ''
        };

        // Update local data
        const recordIndex = appState.data.findIndex(item => item.rowIndex === appState.currentEditingRow);
        if (recordIndex !== -1) {
            Object.assign(appState.data[recordIndex], updatedData);
        }

        // Save to Google Sheets if connected (using detected sheet name)
        if (appState.isSignedIn && appState.detectedSheetName) {
            await safeGoogleSheetsUpdate(appState.currentEditingRow, updatedData);
        }

        // Update filtered data
        const filteredIndex = appState.filteredData.findIndex(item => item.rowIndex === appState.currentEditingRow);
        if (filteredIndex !== -1) {
            Object.assign(appState.filteredData[filteredIndex], updatedData);
        }

        renderTable();
        updateCalendar();
        updateStats();
        closeModal();
        
        AlertManager.success('Registro actualizado exitosamente');

    } catch (error) {
        console.error('Error saving record:', error);
        AlertManager.error('Error al guardar: ' + error.message);
    } finally {
        appState.setLoading(false);
    }
}

// FIXED: Safe Google Sheets update with correct sheet name
async function safeGoogleSheetsUpdate(rowIndex, data) {
    try {
        const values = [
            [data.entity, data.type, data.description, data.dueDate, data.status, data.notes]
        ];

        const sheetName = appState.detectedSheetName || CONFIG.CURRENT_SHEET_NAME;
        const range = `${sheetName}!A${rowIndex}:F${rowIndex}`;

        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: { values }
        });
        
        console.log(`Successfully updated Google Sheets at ${range}`);
    } catch (error) {
        console.error('Error updating Google Sheets:', error);
        AlertManager.warning('Cambio guardado localmente. Error al sincronizar con Google Sheets.');
        throw error;
    }
}

// Clear all data
function clearAllData() {
    appState.data = [];
    appState.filteredData = [];
    
    const tbody = document.getElementById('tableBody');
    if (tbody) tbody.innerHTML = '';
    
    if (appState.calendar) {
        appState.calendar.removeAllEvents();
    }
    
    updateStats();
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    
    // Always stop loading initially
    appState.setLoading(false);
    
    // Setup modal
    setupModal();
    
    // Load demo data immediately to show something
    loadDemoData();
    
    // Try to initialize Google APIs in background
    setTimeout(() => {
        initializeGoogleAPIs();
    }, 1000); // Increased delay to ensure all scripts are loaded
});