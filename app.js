// Google Sheets Tax Calendar Application - Fixed Column Mappings
// Production Configuration
const CONFIG = {
    API_KEY: 'AIzaSyBdlizVp_hOembaoFJYE_rKHCvFtn9asok',
    CLIENT_ID: '341125602004-36tl0jfhtd7ce21csjun41fel085res8.apps.googleusercontent.com',
    SPREADSHEET_ID: '10L6aSKz8oPtq4ZpXcO921vCIciHWlCRqo_w5pAHc3yo',
    DISCOVERY_DOC: 'https://sheets.googleapis.com/$discovery/rest?version=v4',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
    RANGE: 'DATA!A:I'
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

// Google APIs Initialization
async function initializeGoogleAPIs() {
    try {
        console.log('Initializing Google APIs... Attempt:', appState.initializationAttempts + 1);
        appState.initializationAttempts++;
        appState.updateConnectionStatus('loading', 'Inicializando APIs de Google...');

        // Check if we've exceeded max attempts
        if (appState.initializationAttempts > appState.maxInitAttempts) {
            throw new Error('Se agotaron los intentos de conexión');
        }

        // Wait for gapi to be available with timeout
        let gapiReady = false;
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds total

        while (!gapiReady && attempts < maxAttempts) {
            if (typeof gapi !== 'undefined') {
                gapiReady = true;
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (!gapiReady) {
            throw new Error('Google API library no disponible');
        }

        // Initialize gapi with timeout
        await Promise.race([
            new Promise((resolve, reject) => {
                gapi.load('client', {
                    callback: resolve,
                    onerror: () => reject(new Error('Error cargando cliente GAPI'))
                });
            }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout cargando GAPI')), 5000)
            )
        ]);

        await Promise.race([
            gapi.client.init({
                apiKey: CONFIG.API_KEY,
                discoveryDocs: [CONFIG.DISCOVERY_DOC],
            }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout inicializando cliente GAPI')), 5000)
            )
        ]);

        appState.gapiInited = true;
        console.log('GAPI initialized successfully');

        // Initialize Google Sign-In
        let googleAccountsReady = false;
        attempts = 0;

        while (!googleAccountsReady && attempts < maxAttempts) {
            if (typeof google !== 'undefined' && google.accounts) {
                googleAccountsReady = true;
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (googleAccountsReady) {
            try {
                google.accounts.id.initialize({
                    client_id: CONFIG.CLIENT_ID,
                    callback: handleCredentialResponse,
                });
                appState.gsiInited = true;
                console.log('GSI initialized successfully');
            } catch (gsiError) {
                console.warn('GSI initialization failed, but continuing:', gsiError);
                appState.gsiInited = false;
            }
        } else {
            console.warn('Google Sign-In library not available, but continuing');
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

// Handle credential response
function handleCredentialResponse(response) {
    console.log('Credential response received');
    // For this implementation, we'll use the simpler OAuth flow
    handleAuthClick();
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

// Handle authorization
async function handleAuthClick() {
    if (!appState.gapiInited) {
        AlertManager.error('Las APIs de Google no están inicializadas');
        return;
    }

    try {
        appState.setLoading(true);
        appState.updateConnectionStatus('loading', 'Autenticando...');

        // Check if google.accounts.oauth2 is available
        if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
            throw new Error('OAuth library no disponible');
        }

        // Create a token client
        const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CONFIG.CLIENT_ID,
            scope: CONFIG.SCOPES,
            callback: async (response) => {
                try {
                    if (response.error) {
                        throw new Error('Authorization failed: ' + response.error);
                    }
                    
                    console.log('Authorization successful');
                    appState.isSignedIn = true;
                    updateAuthUI();
                    appState.updateConnectionStatus('success', 'Conectado a Google Sheets');
                    
                    await loadSpreadsheetData();
                    AlertManager.success('Conectado exitosamente a Google Sheets');
                } catch (callbackError) {
                    console.error('Authorization callback error:', callbackError);
                    AlertManager.error('Error en la autorización: ' + callbackError.message);
                    appState.updateConnectionStatus('error', 'Error de autorización');
                } finally {
                    appState.setLoading(false);
                }
            },
            error_callback: (error) => {
                console.error('Authorization error:', error);
                appState.setLoading(false);
                appState.updateConnectionStatus('error', 'Error de autorización');
                AlertManager.error('Error en la autorización. Usando datos de demostración.');
            }
        });

        tokenClient.requestAccessToken();

    } catch (error) {
        console.error('Auth error:', error);
        appState.setLoading(false);
        appState.updateConnectionStatus('error', 'Error de autenticación');
        AlertManager.error('Error de autenticación: ' + error.message + '. Usando datos de demostración.');
    }
}

// Handle signout
function handleSignoutClick() {
    try {
        const token = gapi.client.getToken();
        if (token !== null) {
            google.accounts.oauth2.revoke(token.access_token);
            gapi.client.setToken('');
        }
    } catch (error) {
        console.warn('Error during signout:', error);
    }
    
    appState.isSignedIn = false;
    appState.data = [];
    appState.filteredData = [];
    
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

// Helper function to concatenate period and year
function createPeriodoConcat(periodo, ano) {
    if (!periodo || !ano) return '';
    return `${periodo}-${ano}`;
}

// Helper function to split concatenated period
function splitPeriodoConcat(periodoConcat) {
    if (!periodoConcat) return { periodo: '', ano: '' };
    const parts = periodoConcat.split('-');
    if (parts.length >= 2) {
        const ano = parts[parts.length - 1];
        const periodo = parts.slice(0, -1).join('-');
        return { periodo, ano };
    }
    return { periodo: periodoConcat, ano: '' };
}

// Load spreadsheet data
async function loadSpreadsheetData() {
    try {
        console.log('Loading spreadsheet data...');
        appState.setLoading(true);

        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: CONFIG.RANGE,
        });

        const rows = response.result.values;
        if (!rows || rows.length === 0) {
            throw new Error('No se encontraron datos en la hoja de cálculo');
        }

        // Process data (skip header row) - Fixed column mappings
        const headers = rows[0];
        appState.data = rows.slice(1).map((row, index) => ({
            rowIndex: index + 2, // +2 because we skip header and arrays are 0-indexed
            empresa: row[0] || '',           // Column A
            abreviatura: row[1] || '',       // Column B  
            responsable: row[2] || '',       // Column C
            entidad: row[3] || '',           // Column D (FIXED)
            obligacion: row[4] || '',        // Column E (FIXED)
            periodo: row[5] || '',           // Column F
            ano: row[6] || '',               // Column G
            fechaLimite: row[7] || '',       // Column H (FIXED - for calendar)
            estado: row[8] || 'Pendiente',   // Column I (FIXED)
            periodoConcat: createPeriodoConcat(row[5], row[6]) // Concatenated field
        }));

        console.log(`Loaded ${appState.data.length} records`);
        appState.filteredData = [...appState.data];
        
        initializeInterface();
        AlertManager.success(`${appState.data.length} obligaciones cargadas desde Google Sheets`);

    } catch (error) {
        console.error('Error loading data:', error);
        AlertManager.error('Error al cargar datos de Google Sheets: ' + error.message + '. Usando datos de demostración.');
        
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
            empresa: 'Empresa ABC S.A.C.',
            abreviatura: 'ABC',
            responsable: 'Juan Pérez',
            entidad: 'SUNAT',
            obligacion: 'IGV Mensual',
            periodo: 'ene-feb',
            ano: '2025',
            fechaLimite: '2025-01-12',
            estado: 'Pendiente',
            periodoConcat: 'ene-feb-2025'
        },
        {
            rowIndex: 3,
            empresa: 'Servicios XYZ E.I.R.L.',
            abreviatura: 'XYZ',
            responsable: 'María González',
            entidad: 'SUNAT',
            obligacion: 'Renta 3ra Categoría',
            periodo: 'dic',
            ano: '2024',
            fechaLimite: '2025-01-12',
            estado: 'En Proceso',
            periodoConcat: 'dic-2024'
        },
        {
            rowIndex: 4,
            empresa: 'Constructora DEF S.A.',
            abreviatura: 'DEF',
            responsable: 'Carlos Rodríguez',
            entidad: 'ESSALUD',
            obligacion: 'Contribuciones Sociales',
            periodo: 'dic',
            ano: '2024',
            fechaLimite: '2025-01-15',
            estado: 'Pendiente',
            periodoConcat: 'dic-2024'
        },
        {
            rowIndex: 5,
            empresa: 'Comercial GHI S.R.L.',
            abreviatura: 'GHI',
            responsable: 'Ana López',
            entidad: 'SUNAT',
            obligacion: 'PDT 621',
            periodo: 'nov',
            ano: '2024',
            fechaLimite: '2025-01-17',
            estado: 'Completado',
            periodoConcat: 'nov-2024'
        },
        {
            rowIndex: 6,
            empresa: 'Distribuidora JKL S.A.C.',
            abreviatura: 'JKL',
            responsable: 'Roberto Silva',
            entidad: 'Municipalidad de Lima',
            obligacion: 'Licencia de Funcionamiento',
            periodo: 'anual',
            ano: '2024',
            fechaLimite: '2025-01-20',
            estado: 'Vencido',
            periodoConcat: 'anual-2024'
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
        if (item.entidad) entities.add(item.entidad);
        if (item.obligacion) types.add(item.obligacion);
        if (item.estado) statuses.add(item.estado);
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
        return selectedEntities.has(item.entidad) &&
               selectedTypes.has(item.obligacion) &&
               selectedStatuses.has(item.estado);
    });

    renderTable();
    updateCalendar();
    updateStats();
    
    AlertManager.info(`${appState.filteredData.length} registros después del filtro`);
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
            <td>${item.empresa}</td>
            <td>${item.abreviatura}</td>
            <td>${item.responsable}</td>
            <td>${item.entidad}</td>
            <td>${item.obligacion}</td>
            <td>${item.periodoConcat}</td>
            <td>${formatDate(item.fechaLimite)}</td>
            <td class="status-cell">
                <span class="status status--${getStatusClass(item.estado)}">${item.estado}</span>
            </td>
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

// Get calendar events - Using fechaLimite (column H)
function getCalendarEvents() {
    return appState.filteredData.map(item => ({
        title: `${item.entidad} - ${item.obligacion}`,
        date: item.fechaLimite, // Using Fecha límite presentación
        color: getEventColor(item.estado),
        extendedProps: {
            rowIndex: item.rowIndex,
            description: item.obligacion,
            status: item.estado,
            empresa: item.empresa,
            periodo: item.periodoConcat
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
        if (!item.fechaLimite) return false;
        const dueDate = new Date(item.fechaLimite);
        const diffTime = dueDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 7 && item.estado !== 'Completado';
    }).length;
    
    const overdue = appState.filteredData.filter(item => {
        if (!item.fechaLimite) return false;
        const dueDate = new Date(item.fechaLimite);
        return dueDate < today && item.estado !== 'Completado';
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
    
    // Populate modal with correct field mappings
    document.getElementById('editEmpresa').value = record.empresa || '';
    document.getElementById('editAbreviatura').value = record.abreviatura || '';
    document.getElementById('editResponsable').value = record.responsable || '';
    document.getElementById('editEntidad').value = record.entidad || '';
    document.getElementById('editObligacion').value = record.obligacion || '';
    document.getElementById('editPeriodo').value = record.periodoConcat || '';
    document.getElementById('editFechaLimite').value = record.fechaLimite || '';
    document.getElementById('editEstado').value = record.estado || 'Pendiente';

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

// Save record
async function saveRecord(e) {
    e.preventDefault();
    
    if (!appState.currentEditingRow) {
        AlertManager.error('No hay registro seleccionado para editar');
        return;
    }

    try {
        appState.setLoading(true);

        const periodoConcat = document.getElementById('editPeriodo')?.value || '';
        const { periodo, ano } = splitPeriodoConcat(periodoConcat);

        const updatedData = {
            empresa: document.getElementById('editEmpresa')?.value || '',
            abreviatura: document.getElementById('editAbreviatura')?.value || '',
            responsable: document.getElementById('editResponsable')?.value || '',
            entidad: document.getElementById('editEntidad')?.value || '',
            obligacion: document.getElementById('editObligacion')?.value || '',
            periodo: periodo,
            ano: ano,
            fechaLimite: document.getElementById('editFechaLimite')?.value || '',
            estado: document.getElementById('editEstado')?.value || 'Pendiente',
            periodoConcat: periodoConcat
        };

        // Update local data
        const recordIndex = appState.data.findIndex(item => item.rowIndex === appState.currentEditingRow);
        if (recordIndex !== -1) {
            Object.assign(appState.data[recordIndex], updatedData);
        }

        // Save to Google Sheets if connected
        if (appState.isSignedIn) {
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

// Safe Google Sheets update with error handling - Updated for correct columns
async function safeGoogleSheetsUpdate(rowIndex, data) {
    try {
        const values = [
            [
                data.empresa,        // Column A
                data.abreviatura,    // Column B  
                data.responsable,    // Column C
                data.entidad,        // Column D
                data.obligacion,     // Column E
                data.periodo,        // Column F
                data.ano,            // Column G
                data.fechaLimite,    // Column H
                data.estado          // Column I
            ]
        ];

        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `DATA!A${rowIndex}:I${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values }
        });
        
        console.log('Successfully updated Google Sheets');
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
    }, 500);
});

// Add CSS for slideOut animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);