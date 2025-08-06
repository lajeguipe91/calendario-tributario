// Google Sheets Tax Calendar Application - Enhanced Version
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
            empresa: new Set(),
            entidad: new Set(),
            responsable: new Set(),
            estado: new Set()
        };
        this.calendar = null;
        this.currentEditingRow = null;
        this.selectedRows = new Set();
        this.initializationAttempts = 0;
        this.maxInitAttempts = 3;
        this.filtersVisible = true;
        this.tableVisible = true;
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

// Date parsing utility
function parseDate(dateString) {
    if (!dateString) return null;
    
    // Try different date formats
    const formats = [
        /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
        /^\d{2}\/\d{2}\/\d{4}$/, // DD/MM/YYYY
        /^\d{1,2}\/\d{1,2}\/\d{4}$/, // D/M/YYYY or DD/M/YYYY
    ];
    
    try {
        // First try direct parsing
        let date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            return date;
        }
        
        // Try DD/MM/YYYY format
        if (formats[1].test(dateString) || formats[2].test(dateString)) {
            const parts = dateString.split('/');
            if (parts.length === 3) {
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
                const year = parseInt(parts[2], 10);
                date = new Date(year, month, day);
                if (!isNaN(date.getTime())) {
                    return date;
                }
            }
        }
        
        return null;
    } catch (error) {
        console.warn('Error parsing date:', dateString, error);
        return null;
    }
}

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

        if (appState.initializationAttempts > appState.maxInitAttempts) {
            throw new Error('Se agotaron los intentos de conexión');
        }

        // Wait for gapi to be available
        let gapiReady = false;
        let attempts = 0;
        const maxAttempts = 50;

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

        // Initialize gapi
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
        loadDemoData();

    } catch (error) {
        console.error('Error initializing Google APIs:', error);
        appState.updateConnectionStatus('error', `Error al inicializar: ${error.message}`);
        AlertManager.error(`Error al conectar con Google: ${error.message}`);
        setupAuthButton();
        loadDemoData();
    }
}

// Handle credential response
function handleCredentialResponse(response) {
    console.log('Credential response received');
    handleAuthClick();
}

// Setup auth button and other UI controls
function setupAuthButton() {
    const authBtn = document.getElementById('authBtn');
    const signoutBtn = document.getElementById('signoutBtn');
    const retryBtn = document.getElementById('retryBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const toggleFiltersBtn = document.getElementById('toggleFiltersBtn');
    const toggleTableBtn = document.getElementById('toggleTableBtn');

    if (authBtn) {
        authBtn.addEventListener('click', handleAuthClick);
    }
    if (signoutBtn) {
        signoutBtn.addEventListener('click', handleSignoutClick);
    }
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            appState.updateConnectionStatus('loading', 'Reintentando conexión...');
            appState.initializationAttempts = 0;
            initializeGoogleAPIs();
        });
    }
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshData);
    }
    if (toggleFiltersBtn) {
        toggleFiltersBtn.addEventListener('click', toggleFilters);
    }
    if (toggleTableBtn) {
        toggleTableBtn.addEventListener('click', toggleTable);
    }

    updateAuthUI();
}

// Refresh data function
async function refreshData() {
    AlertManager.info('Actualizando datos...');
    appState.setLoading(true);
    try {
        if (appState.isSignedIn) {
            await loadSpreadsheetData();
        } else {
            loadDemoData();
        }
    } finally {
        appState.setLoading(false);
    }
}

// Toggle filters visibility
function toggleFilters() {
    const panel = document.getElementById('filtersPanel');
    if (panel) {
        appState.filtersVisible = !appState.filtersVisible;
        if (appState.filtersVisible) {
            panel.classList.remove('collapsed');
        } else {
            panel.classList.add('collapsed');
        }
        AlertManager.info(`Filtros ${appState.filtersVisible ? 'mostrados' : 'ocultos'}`);
    }
}

// Toggle table visibility
function toggleTable() {
    const panel = document.getElementById('tablePanel');
    if (panel) {
        appState.tableVisible = !appState.tableVisible;
        if (appState.tableVisible) {
            panel.classList.remove('collapsed');
        } else {
            panel.classList.add('collapsed');
        }
        AlertManager.info(`Listado ${appState.tableVisible ? 'mostrado' : 'oculto'}`);
    }
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

        if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
            throw new Error('OAuth library no disponible');
        }

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
    appState.selectedRows.clear();
    
    updateAuthUI();
    clearAllData();
    loadDemoData();
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

// Load spreadsheet data
async function loadSpreadsheetData() {
    try {
        console.log('Loading spreadsheet data...');

        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: CONFIG.RANGE,
        });

        const rows = response.result.values;
        if (!rows || rows.length === 0) {
            throw new Error('No se encontraron datos en la hoja DATA');
        }

        // Process data (skip header row)
        const headers = rows[0];
        let validRows = 0;
        let invalidRows = 0;
        
        appState.data = rows.slice(1).map((row, index) => {
            const fechaLimite = parseDate(row[7] || '');
            
            if (!fechaLimite) {
                invalidRows++;
                console.warn(`Fila ${index + 2}: Fecha inválida "${row[7]}"`);
            } else {
                validRows++;
            }

            return {
                rowIndex: index + 2,
                empresa: row[0] || '',
                abreviatura: row[1] || '',
                responsable: row[2] || '',
                entidad: row[3] || '',
                obligacion: row[4] || '',
                periodo: row[5] || '',
                ano: row[6] || new Date().getFullYear().toString(),
                fechaLimite: fechaLimite,
                fechaLimiteString: row[7] || '',
                estado: row[8] || 'Pendiente',
                periodoCompleto: `${row[5] || ''}-${row[6] || new Date().getFullYear()}`
            };
        });

        console.log(`Loaded ${appState.data.length} records (${validRows} valid, ${invalidRows} with date issues)`);
        
        if (invalidRows > 0) {
            AlertManager.warning(`${invalidRows} registros tienen fechas inválidas y pueden no mostrarse correctamente en el calendario`);
        }

        appState.filteredData = [...appState.data];
        initializeInterface();
        AlertManager.success(`${validRows} obligaciones cargadas desde Google Sheets`);

    } catch (error) {
        console.error('Error loading data:', error);
        AlertManager.error('Error al cargar datos de Google Sheets: ' + error.message + '. Usando datos de demostración.');
        loadDemoData();
    }
}

// Load demo data
function loadDemoData() {
    console.log('Loading demo data...');
    
    appState.data = [
        {
            rowIndex: 2,
            empresa: 'ABC Corp',
            abreviatura: 'ABC',
            responsable: 'Contador General',
            entidad: 'SUNAT',
            obligacion: 'Declaración mensual de IGV',
            periodo: 'Enero',
            ano: '2025',
            fechaLimite: new Date('2025-01-12'),
            fechaLimiteString: '2025-01-12',
            estado: 'Pendiente',
            periodoCompleto: 'Enero-2025'
        },
        {
            rowIndex: 3,
            empresa: 'XYZ Ltda',
            abreviatura: 'XYZ',
            responsable: 'Gerente Financiero',
            entidad: 'SUNAT',
            obligacion: 'Pago a cuenta de Impuesto a la Renta',
            periodo: 'Enero',
            ano: '2025',
            fechaLimite: new Date('2025-01-12'),
            fechaLimiteString: '2025-01-12',
            estado: 'Presentada',
            periodoCompleto: 'Enero-2025'
        },
        {
            rowIndex: 4,
            empresa: 'DEF S.A.',
            abreviatura: 'DEF',
            responsable: 'RRHH',
            entidad: 'ESSALUD',
            obligacion: 'Declaración y pago de contribuciones',
            periodo: 'Enero',
            ano: '2025',
            fechaLimite: new Date('2025-01-15'),
            fechaLimiteString: '2025-01-15',
            estado: 'Pendiente',
            periodoCompleto: 'Enero-2025'
        },
        {
            rowIndex: 5,
            empresa: 'GHI Inc',
            abreviatura: 'GHI',
            responsable: 'Contador',
            entidad: 'SUNAT',
            obligacion: 'Presentación de PDT 621',
            periodo: 'Diciembre',
            ano: '2024',
            fechaLimite: new Date('2024-12-30'),
            fechaLimiteString: '2024-12-30',
            estado: 'Pendiente',
            periodoCompleto: 'Diciembre-2024'
        },
        {
            rowIndex: 6,
            empresa: 'JKL Corp',
            abreviatura: 'JKL',
            responsable: 'Legal',
            entidad: 'Municipalidad',
            obligacion: 'Renovación de licencia municipal',
            periodo: 'Anual',
            ano: '2025',
            fechaLimite: new Date('2025-01-20'),
            fechaLimiteString: '2025-01-20',
            estado: 'No aplica',
            periodoCompleto: 'Anual-2025'
        }
    ];

    appState.filteredData = [...appState.data];
    initializeInterface();
    
    if (!appState.isSignedIn) {
        AlertManager.warning('Usando datos de demostración. Conéctate a Google Sheets para datos reales.');
    }
}

// Initialize interface components
function initializeInterface() {
    setupFilters();
    renderTable();
    setupCalendar();
    updateStats();
    setupBulkActions();
}

// Setup filters with unique values and select all
function setupFilters() {
    const empresas = new Set();
    const entidades = new Set();
    const responsables = new Set();
    const estados = new Set();

    appState.data.forEach(item => {
        if (item.empresa) empresas.add(item.empresa);
        if (item.entidad) entidades.add(item.entidad);
        if (item.responsable) responsables.add(item.responsable);
        if (item.estado) estados.add(item.estado);
    });

    createFilterCheckboxes('empresaFilters', empresas, 'empresa');
    createFilterCheckboxes('entidadFilters', entidades, 'entidad');
    createFilterCheckboxes('responsableFilters', responsables, 'responsable');
    createFilterCheckboxes('estadoFilters', estados, 'estado');

    setupFilterSearch();
    setupFilterActions();
}

// Create filter checkboxes with "Seleccionar todo" option
function createFilterCheckboxes(containerId, items, filterType) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';

    // Add "Seleccionar todo" checkbox
    const selectAllDiv = document.createElement('div');
    selectAllDiv.className = 'filter-checkbox select-all';
    selectAllDiv.innerHTML = `
        <input type="checkbox" id="${filterType}_select_all" value="__all__" checked>
        <label for="${filterType}_select_all">Seleccionar todo</label>
    `;
    
    const selectAllCheckbox = selectAllDiv.querySelector('input');
    selectAllCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        container.querySelectorAll('input[type="checkbox"]:not([value="__all__"])').forEach(cb => {
            cb.checked = isChecked;
        });
        applyFilters();
    });
    
    container.appendChild(selectAllDiv);

    // Add individual item checkboxes
    Array.from(items).sort().forEach(item => {
        const div = document.createElement('div');
        div.className = 'filter-checkbox';
        div.innerHTML = `
            <input type="checkbox" id="${filterType}_${item.replace(/\s+/g, '_')}" value="${item}" checked>
            <label for="${filterType}_${item.replace(/\s+/g, '_')}">${item}</label>
        `;
        
        const checkbox = div.querySelector('input');
        checkbox.addEventListener('change', () => {
            // Update "Seleccionar todo" state
            const allCheckboxes = container.querySelectorAll('input[type="checkbox"]:not([value="__all__"])');
            const checkedCheckboxes = container.querySelectorAll('input[type="checkbox"]:not([value="__all__"]):checked');
            const selectAllCb = container.querySelector('input[value="__all__"]');
            
            if (selectAllCb) {
                selectAllCb.checked = allCheckboxes.length === checkedCheckboxes.length;
                selectAllCb.indeterminate = checkedCheckboxes.length > 0 && checkedCheckboxes.length < allCheckboxes.length;
            }
            
            applyFilters();
        });
        
        container.appendChild(div);
    });
}

// Setup filter search
function setupFilterSearch() {
    const searches = ['empresaSearch', 'entidadSearch', 'responsableSearch'];
    const containers = ['empresaFilters', 'entidadFilters', 'responsableFilters'];
    
    searches.forEach((searchId, index) => {
        const searchElement = document.getElementById(searchId);
        if (searchElement) {
            searchElement.addEventListener('input', (e) => filterCheckboxes(containers[index], e.target.value));
        }
    });
}

// Filter checkboxes based on search
function filterCheckboxes(containerId, searchTerm) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('.filter-checkbox:not(.select-all)');
    
    checkboxes.forEach(checkbox => {
        const label = checkbox.querySelector('label').textContent.toLowerCase();
        const isVisible = label.includes(searchTerm.toLowerCase());
        checkbox.style.display = isVisible ? 'flex' : 'none';
    });
}

// Setup filter actions
function setupFilterActions() {
    const clearBtn = document.getElementById('clearFilters');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearFilters);
    }
}

// Clear all filters
function clearFilters() {
    document.querySelectorAll('.filter-checkbox input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = true;
        checkbox.indeterminate = false;
    });
    
    document.querySelectorAll('.filter-search').forEach(search => {
        search.value = '';
    });
    
    // Reset filter visibility
    document.querySelectorAll('.filter-checkbox:not(.select-all)').forEach(checkbox => {
        checkbox.style.display = 'flex';
    });
    
    applyFilters();
}

// Apply filters with live updates (removed excessive loading)
function applyFilters() {
    const selectedEmpresas = getSelectedFilters('empresa');
    const selectedEntidades = getSelectedFilters('entidad');
    const selectedResponsables = getSelectedFilters('responsable');
    const selectedEstados = getSelectedFilters('estado');

    appState.filteredData = appState.data.filter(item => {
        return selectedEmpresas.has(item.empresa) &&
               selectedEntidades.has(item.entidad) &&
               selectedResponsables.has(item.responsable) &&
               selectedEstados.has(item.estado);
    });

    renderTable();
    updateCalendar();
    updateStats();
    updateBulkActionsBar();
}

// Get selected filters
function getSelectedFilters(filterType) {
    const selected = new Set();
    document.querySelectorAll(`input[id^="${filterType}_"]:checked:not([value="__all__"])`).forEach(checkbox => {
        selected.add(checkbox.value);
    });
    return selected;
}

// Render table with bulk selection
function renderTable() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';

    appState.filteredData.forEach(item => {
        const statusClass = getStatusClassForRow(item);
        const isSelected = appState.selectedRows.has(item.rowIndex);
        
        const row = document.createElement('tr');
        row.className = statusClass;
        if (isSelected) row.classList.add('selected');
        
        row.innerHTML = `
            <td>
                <input type="checkbox" class="row-checkbox" data-row-index="${item.rowIndex}" ${isSelected ? 'checked' : ''}>
            </td>
            <td>${item.empresa}</td>
            <td>${item.abreviatura}</td>
            <td>${item.responsable}</td>
            <td>${item.entidad}</td>
            <td>${item.obligacion}</td>
            <td>${item.periodoCompleto}</td>
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
        
        // Add event listener for row checkbox
        const checkbox = row.querySelector('.row-checkbox');
        checkbox.addEventListener('change', (e) => {
            const rowIndex = parseInt(e.target.dataset.rowIndex);
            if (e.target.checked) {
                appState.selectedRows.add(rowIndex);
                row.classList.add('selected');
            } else {
                appState.selectedRows.delete(rowIndex);
                row.classList.remove('selected');
            }
            updateBulkActionsBar();
            updateSelectAllCheckbox();
        });
        
        tbody.appendChild(row);
    });
    
    updateSelectAllCheckbox();
}

// Get status class for table rows
function getStatusClassForRow(item) {
    if (!item.fechaLimite) return '';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(item.fechaLimite);
    dueDate.setHours(0, 0, 0, 0);
    
    const estado = item.estado.toLowerCase();
    
    if (estado === 'presentada') {
        return 'status-presentada';
    } else if (estado === 'no aplica') {
        return 'status-no-aplica';
    } else if (estado === 'pendiente') {
        if (dueDate < today) {
            return 'status-vencida';
        } else {
            return 'status-pendiente';
        }
    }
    
    return '';
}

// Format date for display
function formatDate(date) {
    if (!date) return '';
    try {
        return date.toLocaleDateString('es-ES');
    } catch {
        return '';
    }
}

// Get status CSS class
function getStatusClass(status) {
    switch (status?.toLowerCase()) {
        case 'presentada': return 'success';
        case 'no aplica': return 'info';
        case 'pendiente': return 'warning';
        default: return 'info';
    }
}

// Setup bulk actions
function setupBulkActions() {
    const selectAllCb = document.getElementById('selectAllCheckbox');
    const bulkStatusBtn = document.getElementById('bulkStatusBtn');
    const clearSelectionBtn = document.getElementById('clearSelectionBtn');
    
    if (selectAllCb) {
        selectAllCb.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            appState.selectedRows.clear();
            
            if (isChecked) {
                appState.filteredData.forEach(item => {
                    appState.selectedRows.add(item.rowIndex);
                });
            }
            
            document.querySelectorAll('.row-checkbox').forEach(cb => {
                cb.checked = isChecked;
            });
            
            document.querySelectorAll('#tableBody tr').forEach(row => {
                if (isChecked) {
                    row.classList.add('selected');
                } else {
                    row.classList.remove('selected');
                }
            });
            
            updateBulkActionsBar();
        });
    }
    
    if (bulkStatusBtn) {
        bulkStatusBtn.addEventListener('click', showBulkStatusModal);
    }
    
    if (clearSelectionBtn) {
        clearSelectionBtn.addEventListener('click', clearSelection);
    }
    
    setupBulkStatusModal();
}

// Update select all checkbox
function updateSelectAllCheckbox() {
    const selectAllCb = document.getElementById('selectAllCheckbox');
    if (!selectAllCb) return;
    
    const totalVisible = appState.filteredData.length;
    const selectedVisible = appState.filteredData.filter(item => 
        appState.selectedRows.has(item.rowIndex)
    ).length;
    
    selectAllCb.checked = totalVisible > 0 && selectedVisible === totalVisible;
    selectAllCb.indeterminate = selectedVisible > 0 && selectedVisible < totalVisible;
}

// Update bulk actions bar - Fixed to show properly
function updateBulkActionsBar() {
    const bar = document.getElementById('bulkActionsBar');
    const countSpan = document.getElementById('selectedCount');
    
    if (bar && countSpan) {
        const selectedCount = appState.selectedRows.size;
        
        if (selectedCount > 0) {
            bar.classList.remove('hidden');
            countSpan.textContent = `${selectedCount} seleccionado${selectedCount !== 1 ? 's' : ''}`;
            console.log('Bulk actions bar shown for', selectedCount, 'items');
        } else {
            bar.classList.add('hidden');
        }
    }
}

// Clear selection
function clearSelection() {
    appState.selectedRows.clear();
    document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('#tableBody tr').forEach(row => row.classList.remove('selected'));
    updateBulkActionsBar();
    updateSelectAllCheckbox();
}

// Show bulk status modal
function showBulkStatusModal() {
    const modal = document.getElementById('bulkStatusModal');
    const countSpan = document.getElementById('bulkItemCount');
    
    if (modal && countSpan) {
        countSpan.textContent = appState.selectedRows.size;
        modal.classList.remove('hidden');
    }
}

// Setup bulk status modal
function setupBulkStatusModal() {
    const modal = document.getElementById('bulkStatusModal');
    const closeBtn = document.getElementById('closeBulkModal');
    const cancelBtn = document.getElementById('cancelBulkEdit');
    const form = document.getElementById('bulkStatusForm');

    if (closeBtn) closeBtn.addEventListener('click', closeBulkStatusModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeBulkStatusModal);
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeBulkStatusModal();
        });
    }

    if (form) form.addEventListener('submit', saveBulkStatusChange);
}

// Close bulk status modal
function closeBulkStatusModal() {
    const modal = document.getElementById('bulkStatusModal');
    if (modal) modal.classList.add('hidden');
}

// Save bulk status change
async function saveBulkStatusChange(e) {
    e.preventDefault();
    
    const newStatus = document.getElementById('bulkEstado')?.value;
    if (!newStatus || appState.selectedRows.size === 0) {
        AlertManager.error('Selecciona un estado válido');
        return;
    }

    try {
        appState.setLoading(true);
        
        // Update local data
        const updatedRows = [];
        appState.selectedRows.forEach(rowIndex => {
            const dataIndex = appState.data.findIndex(item => item.rowIndex === rowIndex);
            if (dataIndex !== -1) {
                appState.data[dataIndex].estado = newStatus;
                updatedRows.push(rowIndex);
            }
        });
        
        // Update Google Sheets if connected
        if (appState.isSignedIn && updatedRows.length > 0) {
            await bulkUpdateGoogleSheets(updatedRows, newStatus);
        }
        
        // Update filtered data
        appState.filteredData.forEach(item => {
            if (appState.selectedRows.has(item.rowIndex)) {
                item.estado = newStatus;
            }
        });
        
        renderTable();
        updateCalendar();
        updateStats();
        closeBulkStatusModal();
        clearSelection();
        
        AlertManager.success(`Estado actualizado para ${updatedRows.length} registro${updatedRows.length !== 1 ? 's' : ''}`);

    } catch (error) {
        console.error('Error in bulk update:', error);
        AlertManager.error('Error al actualizar estados: ' + error.message);
    } finally {
        appState.setLoading(false);
    }
}

// Bulk update Google Sheets
async function bulkUpdateGoogleSheets(rowIndexes, newStatus) {
    try {
        const requests = rowIndexes.map(rowIndex => ({
            range: `DATA!I${rowIndex}:I${rowIndex}`,
            values: [[newStatus]]
        }));
        
        await gapi.client.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            resource: {
                valueInputOption: 'USER_ENTERED',
                data: requests
            }
        });
        
        console.log('Successfully updated Google Sheets in bulk');
    } catch (error) {
        console.error('Error updating Google Sheets in bulk:', error);
        AlertManager.warning('Cambios guardados localmente. Error al sincronizar con Google Sheets.');
        throw error;
    }
}

// Setup calendar with enhanced color rules and event titles
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

// Get calendar events with enhanced color rules and titles
function getCalendarEvents() {
    return appState.filteredData.filter(item => item.fechaLimite).map(item => {
        const { color, className } = getEventColorAndClass(item);
        
        return {
            title: `${item.abreviatura} – ${item.entidad}`,
            date: item.fechaLimite.toISOString().split('T')[0],
            color: color,
            className: className,
            extendedProps: {
                rowIndex: item.rowIndex,
                description: item.obligacion,
                status: item.estado,
                empresa: item.empresa
            }
        };
    });
}

// Get event color and class based on enhanced status rules
function getEventColorAndClass(item) {
    if (!item.fechaLimite) {
        return { color: '#6b7280', className: 'fc-event-no-aplica' };
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(item.fechaLimite);
    dueDate.setHours(0, 0, 0, 0);
    
    const estado = item.estado.toLowerCase();
    
    if (estado === 'presentada') {
        return { color: '#22c55e', className: 'fc-event-presentada' };
    } else if (estado === 'no aplica') {
        return { color: '#6b7280', className: 'fc-event-no-aplica' };
    } else if (estado === 'pendiente') {
        if (dueDate < today) {
            // Vencida: Pendiente y fecha límite < hoy
            return { color: '#ef4444', className: 'fc-event-vencida' };
        } else {
            // Pendiente futuro
            return { color: '#f59e0b', className: 'fc-event-pendiente' };
        }
    }
    
    // Default
    return { color: '#f59e0b', className: 'fc-event-pendiente' };
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
        dueDate.setHours(0, 0, 0, 0);
        const diffTime = dueDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 7 && item.estado.toLowerCase() !== 'presentada';
    }).length;
    
    const overdue = appState.filteredData.filter(item => {
        if (!item.fechaLimite) return false;
        const dueDate = new Date(item.fechaLimite);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate < today && item.estado.toLowerCase() === 'pendiente';
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
    const fields = [
        'editEmpresa', 'editAbreviatura', 'editResponsable', 'editEntidad', 
        'editObligacion', 'editPeriodo', 'editAno', 'editFechaLimite', 'editEstado'
    ];
    const values = [
        record.empresa, record.abreviatura, record.responsable, record.entidad,
        record.obligacion, record.periodo, record.ano, 
        record.fechaLimiteString, record.estado
    ];
    
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

// Save record
async function saveRecord(e) {
    e.preventDefault();
    
    if (!appState.currentEditingRow) {
        AlertManager.error('No hay registro seleccionado para editar');
        return;
    }

    try {
        appState.setLoading(true);

        const fechaLimiteString = document.getElementById('editFechaLimite')?.value || '';
        const fechaLimite = parseDate(fechaLimiteString);
        
        if (!fechaLimite) {
            AlertManager.error('La fecha límite no es válida');
            return;
        }

        const updatedData = {
            empresa: document.getElementById('editEmpresa')?.value || '',
            abreviatura: document.getElementById('editAbreviatura')?.value || '',
            responsable: document.getElementById('editResponsable')?.value || '',
            entidad: document.getElementById('editEntidad')?.value || '',
            obligacion: document.getElementById('editObligacion')?.value || '',
            periodo: document.getElementById('editPeriodo')?.value || '',
            ano: document.getElementById('editAno')?.value || new Date().getFullYear().toString(),
            fechaLimite: fechaLimite,
            fechaLimiteString: fechaLimiteString,
            estado: document.getElementById('editEstado')?.value || 'Pendiente'
        };
        
        updatedData.periodoCompleto = `${updatedData.periodo}-${updatedData.ano}`;

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

// Safe Google Sheets update
async function safeGoogleSheetsUpdate(rowIndex, data) {
    try {
        const values = [
            [data.empresa, data.abreviatura, data.responsable, data.entidad, 
             data.obligacion, data.periodo, data.ano, data.fechaLimiteString, data.estado]
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
    appState.selectedRows.clear();
    
    const tbody = document.getElementById('tableBody');
    if (tbody) tbody.innerHTML = '';
    
    if (appState.calendar) {
        appState.calendar.removeAllEvents();
    }
    
    updateStats();
    updateBulkActionsBar();
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    
    appState.setLoading(false);
    setupModal();
    loadDemoData();
    
    setTimeout(() => {
        initializeGoogleAPIs();
    }, 500);
});