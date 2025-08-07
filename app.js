// Google Sheets Tax Calendar Application - Fixed Version with USER LOGIN and correct DATA sheet
// Production Configuration with corrected sheet names and user authentication
const CONFIG = {
    API_KEY: 'AIzaSyBdlizVp_hOembaoFJYE_rKHCvFtn9asok',
    CLIENT_ID: '341125602004-36tl0jfhtd7ce21csjun41fel085res8.apps.googleusercontent.com',
    SPREADSHEET_ID: '10L6aSKz8oPtq4ZpXcO921vCIciHWlCRqo_w5pAHc3yo',
    DISCOVERY_DOC: 'https://sheets.googleapis.com/$discovery/rest?version=v4',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
    // CRITICAL FIX: Correct ranges
    DATA_RANGE: 'DATA!A:I',  // Fixed: DATA sheet, columns A to I
    USERS_RANGE: 'USUARIOS!A:E'  // USUARIOS sheet, columns A to E
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
        this.users = [];
        this.currentUser = null;
        this.filters = {
            entities: new Set(),
            types: new Set(),
            statuses: new Set()
        };
        this.calendar = null;
        this.currentEditingRow = null;
        this.initializationAttempts = 0;
        this.maxInitAttempts = 2;
        this.tokenClient = null;
        this.loadingTimeout = null;
    }

    setLoading(loading, message = 'Cargando...') {
        this.isLoading = loading;
        const overlay = document.getElementById('loadingOverlay');
        const loadingText = overlay?.querySelector('p');
        
        if (overlay) {
            if (loading) {
                overlay.classList.remove('hidden');
                if (loadingText) loadingText.textContent = message;
                
                // CRITICAL FIX: Set timeout to prevent stuck loading
                this.loadingTimeout = setTimeout(() => {
                    console.warn('Loading timeout reached, hiding overlay');
                    this.setLoading(false);
                    AlertManager.warning('Tiempo de espera agotado. Usando datos de demostración.');
                }, 15000); // 15 seconds timeout
            } else {
                overlay.classList.add('hidden');
                if (this.loadingTimeout) {
                    clearTimeout(this.loadingTimeout);
                    this.loadingTimeout = null;
                }
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
                case 'loading':
                    icon.textContent = '🔄';
                    if (retryBtn) retryBtn.classList.add('hidden');
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

// Wait for Google APIs to load with timeout
function waitForGoogleAPI() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds
        
        const checkAPI = () => {
            attempts++;
            if (typeof gapi !== 'undefined' && gapi.load) {
                resolve();
            } else if (attempts >= maxAttempts) {
                reject(new Error('Google API no se cargó en el tiempo esperado'));
            } else {
                setTimeout(checkAPI, 100);
            }
        };
        
        checkAPI();
    });
}

// Wait for Google GSI to load with timeout
function waitForGoogleGSI() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds
        
        const checkGSI = () => {
            attempts++;
            if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
                resolve();
            } else if (attempts >= maxAttempts) {
                reject(new Error('Google GSI no se cargó en el tiempo esperado'));
            } else {
                setTimeout(checkGSI, 100);
            }
        };
        
        checkGSI();
    });
}

// CRITICAL FIX: Better error handling and timeout management
async function initializeGoogleAPIs() {
    try {
        console.log('Initializing Google APIs... Attempt:', appState.initializationAttempts + 1);
        appState.initializationAttempts++;
        appState.updateConnectionStatus('loading', 'Inicializando APIs de Google...');

        if (appState.initializationAttempts > appState.maxInitAttempts) {
            throw new Error('Se agotaron los intentos de conexión');
        }

        // CRITICAL FIX: Don't show loading modal during API initialization
        await waitForGoogleAPI();
        console.log('Google API disponible');

        await new Promise((resolve, reject) => {
            gapi.load('client', {
                callback: resolve,
                onerror: () => reject(new Error('Error al cargar el cliente de Google API'))
            });
        });

        await gapi.client.init({
            apiKey: CONFIG.API_KEY,
            discoveryDocs: [CONFIG.DISCOVERY_DOC],
        });

        appState.gapiInited = true;
        console.log('GAPI initialized successfully');

        try {
            await waitForGoogleGSI();
            console.log('Google GSI disponible');

            appState.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CONFIG.CLIENT_ID,
                scope: CONFIG.SCOPES,
                prompt: '',
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

    } catch (error) {
        console.error('Error initializing Google APIs:', error);
        appState.updateConnectionStatus('error', `Error al inicializar: ${error.message}`);
        AlertManager.error(`Error al conectar con Google: ${error.message}`);
        setupAuthButton();
    }
}

// CRITICAL FIX: OAuth callback handler with better error handling
async function handleOAuthCallback(response) {
    try {
        console.log('Authorization successful');
        
        if (response.error) {
            throw new Error('OAuth error: ' + response.error);
        }

        if (!response.access_token) {
            throw new Error('No se recibió token de acceso');
        }

        gapi.client.setToken({
            access_token: response.access_token
        });

        appState.isSignedIn = true;
        updateAuthUI();
        appState.updateConnectionStatus('success', 'Conectado a Google Sheets');
        
        // CRITICAL FIX: Load users from USUARIOS sheet with proper loading handling
        await loadUsers();
        
    } catch (error) {
        console.error('OAuth callback error:', error);
        appState.isSignedIn = false;
        updateAuthUI();
        appState.setLoading(false); // CRITICAL FIX: Ensure loading stops
        appState.updateConnectionStatus('error', 'Error de autorización');
        AlertManager.error('Error en la autorización: ' + error.message);
        loadDemoData(); // Fallback to demo data
    }
}

// CRITICAL FIX: OAuth error handler with proper loading cleanup
function handleOAuthError(error) {
    console.error('OAuth error:', error);
    appState.setLoading(false); // CRITICAL FIX: Ensure loading stops
    appState.isSignedIn = false;
    updateAuthUI();
    
    if (error.type === 'popup_closed') {
        appState.updateConnectionStatus('error', 'Ventana de autenticación cerrada');
        AlertManager.warning('Ventana de autenticación cerrada. Inténtalo de nuevo.');
    } else {
        appState.updateConnectionStatus('error', 'Error de autorización');
        AlertManager.error('Error en la autorización. Usando datos de demostración.');
    }
    
    // Fallback to demo data
    loadDemoData();
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
            appState.initializationAttempts = 0;
            initializeGoogleAPIs();
        });
    }

    updateAuthUI();
}

// CRITICAL FIX: Better error handling for auth click
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
        appState.setLoading(true, 'Conectando a Google...');
        appState.updateConnectionStatus('loading', 'Autenticando...');
        console.log('Requesting access token...');
        
        // CRITICAL FIX: Set timeout for auth process
        setTimeout(() => {
            if (appState.isLoading && !appState.isSignedIn) {
                appState.setLoading(false);
                AlertManager.warning('Tiempo de espera agotado en la autenticación');
            }
        }, 30000); // 30 seconds timeout
        
        appState.tokenClient.requestAccessToken();
        
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
    appState.currentUser = null;
    appState.users = [];
    appState.data = [];
    appState.filteredData = [];
    
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
        if (appState.currentUser) {
            authBtn.classList.add('hidden');
            signoutBtn.classList.remove('hidden');
        } else {
            authBtn.classList.remove('hidden');
            signoutBtn.classList.add('hidden');
            if (authText) {
                authText.textContent = appState.isSignedIn ? 'Iniciar Sesión' : 'Conectar a Google';
            }
        }
    }
}

// CRITICAL FIX: Load users with better error handling and loading management
async function loadUsers() {
    try {
        console.log('Loading users from USUARIOS sheet...');
        appState.setLoading(true, 'Cargando usuarios...');

        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: CONFIG.USERS_RANGE,
        });

        const rows = response.result.values;
        if (!rows || rows.length === 0) {
            throw new Error('No se encontraron usuarios en la hoja USUARIOS');
        }

        // Skip header row and parse users
        // USUARIOS sheet: A=USER, B=password, C=role, D=companies, E=email
        appState.users = rows.slice(1).map((row, index) => ({
            username: row[0] || '',
            password: row[1] || '', // FIXED: password is column B (index 1), not email
            role: row[2] || '',
            companies: row[3] || '', // FIXED: companies column D (index 3)
            email: row[4] || '' // FIXED: email is column E (index 4)
        })).filter(user => user.username && user.password);

        console.log(`Loaded ${appState.users.length} users`);
        appState.setLoading(false); // CRITICAL FIX: Stop loading before showing modal
        
        if (appState.users.length > 0) {
            // CRITICAL FIX: Small delay to ensure loading modal is hidden
            setTimeout(() => {
                showLoginModal();
            }, 500);
        } else {
            throw new Error('No se encontraron usuarios válidos');
        }

    } catch (error) {
        console.error('Error loading users:', error);
        appState.setLoading(false); // CRITICAL FIX: Ensure loading stops on error
        AlertManager.error('Error al cargar usuarios: ' + error.message);
        loadDemoData();
    }
}

// Show login modal
function showLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.classList.remove('hidden');
        const usernameField = document.getElementById('loginUsername');
        if (usernameField) {
            usernameField.focus();
        }
        
        // Add demo user info to login modal
        const infoDiv = modal.querySelector('.login-info');
        if (infoDiv && appState.users.length > 0) {
            const demoUser = appState.users[0];
            infoDiv.innerHTML = `
                <p class="text-center">
                    <small class="text-secondary">
                        Los datos de usuario se cargan desde la hoja USUARIOS de Google Sheets<br>
                        <strong>Usuarios disponibles: ${appState.users.length}</strong><br>
                        <em>Ejemplo: ${demoUser.username}</em>
                    </small>
                </p>
            `;
        }
    }
}

// Handle login
function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('loginUsername')?.value || '';
    const password = document.getElementById('loginPassword')?.value || '';
    
    if (!username || !password) {
        AlertManager.error('Por favor ingresa usuario y contraseña');
        return;
    }

    // CRITICAL FIX: Find user with correct password field
    const user = appState.users.find(u => 
        u.username.toLowerCase() === username.toLowerCase() && 
        u.password === password
    );

    if (!user) {
        AlertManager.error('Usuario o contraseña incorrectos');
        return;
    }

    appState.currentUser = user;
    closeLoginModal();
    updateAuthUI();
    
    AlertManager.success(`¡Bienvenido ${user.username}!`);
    
    // Load real data after successful login
    loadSpreadsheetData();
}

// Close login modal
function closeLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// CRITICAL FIX: Load spreadsheet data with proper loading management
async function loadSpreadsheetData() {
    try {
        console.log('Loading spreadsheet data...');
        appState.setLoading(true, 'Cargando datos fiscales...');

        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: CONFIG.DATA_RANGE, // FIXED: Use DATA!A:I
        });

        const rows = response.result.values;
        if (!rows || rows.length === 0) {
            throw new Error('No se encontraron datos en la hoja DATA');
        }

        // FIXED: Parse data according to correct column mapping
        // DATA sheet: A=Empresa, B=Abreviatura, C=Responsable, D=Entidad, E=Obligación, F=Periodo, G=Año, H=Fecha límite, I=Estado
        const headers = rows[0];
        appState.data = rows.slice(1).map((row, index) => ({
            rowIndex: index + 2,
            company: row[0] || '',      // A=Empresa
            abbreviation: row[1] || '', // B=Abreviatura  
            responsible: row[2] || '',  // C=Responsable
            entity: row[3] || '',       // D=Entidad
            obligation: row[4] || '',   // E=Obligación
            period: row[5] || '',       // F=Periodo
            year: row[6] || '',         // G=Año
            dueDate: row[7] || '',      // H=Fecha límite
            status: row[8] || 'Pendiente' // I=Estado
        }));

        console.log(`Loaded ${appState.data.length} records from DATA sheet`);
        
        // CRITICAL FIX: Filter data by user companies
        filterDataByUserPermissions();
        
        appState.setLoading(false); // CRITICAL FIX: Stop loading before initializing interface
        initializeInterface();
        appState.updateConnectionStatus('success', 'Datos cargados desde hoja DATA');
        AlertManager.success(`${appState.filteredData.length} obligaciones cargadas y filtradas por permisos`);

    } catch (error) {
        console.error('Error loading data:', error);
        appState.setLoading(false); // CRITICAL FIX: Ensure loading stops on error
        const errorMessage = error.result?.error?.message || error.message;
        appState.updateConnectionStatus('error', `Error cargando datos: ${errorMessage}`);
        AlertManager.error('Error al cargar datos de Google Sheets: ' + errorMessage);
        loadDemoData();
    }
}

// CRITICAL FIX: Filter data by user companies
function filterDataByUserPermissions() {
    if (!appState.currentUser || !appState.currentUser.companies) {
        appState.filteredData = [...appState.data];
        return;
    }

    // Parse user companies (could be comma-separated)
    const userCompanies = appState.currentUser.companies
        .split(',')
        .map(c => c.trim().toLowerCase())
        .filter(c => c);

    // Filter data by user's allowed companies
    appState.filteredData = appState.data.filter(item => {
        if (!item.company) return false;
        const itemCompany = item.company.toLowerCase();
        return userCompanies.some(uc => 
            itemCompany.includes(uc) || uc.includes(itemCompany)
        );
    });

    console.log(`Filtered ${appState.data.length} records to ${appState.filteredData.length} based on user permissions`);
}

// Load demo data as fallback
function loadDemoData() {
    console.log('Loading demo data...');
    
    appState.data = [
        {
            rowIndex: 2,
            company: 'EMPRESA DEMO',
            abbreviation: 'DEMO',
            responsible: 'Contador',
            entity: 'SUNAT',
            obligation: 'Declaración mensual de IGV',
            period: 'Mensual',
            year: '2025',
            dueDate: '2025-01-12',
            status: 'Pendiente'
        },
        {
            rowIndex: 3,
            company: 'EMPRESA DEMO',
            abbreviation: 'DEMO',
            responsible: 'Gerencia',
            entity: 'SUNAT',
            obligation: 'Pago a cuenta de Impuesto a la Renta',
            period: 'Mensual',
            year: '2025',
            dueDate: '2025-01-12',
            status: 'En Proceso'
        },
        {
            rowIndex: 4,
            company: 'EMPRESA DEMO',
            abbreviation: 'DEMO',
            responsible: 'RRHH',
            entity: 'ESSALUD',
            obligation: 'Declaración y pago de contribuciones',
            period: 'Mensual',
            year: '2025',
            dueDate: '2025-01-15',
            status: 'Pendiente'
        }
    ];

    appState.filteredData = [...appState.data];
    appState.setLoading(false); // CRITICAL FIX: Ensure loading stops
    initializeInterface();
    
    if (!appState.currentUser) {
        AlertManager.warning('Usando datos de demostración. Conéctate a Google Sheets para datos reales.');
    }
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
    const obligations = new Set();
    const statuses = new Set();

    appState.filteredData.forEach(item => {
        if (item.entity) entities.add(item.entity);
        if (item.obligation) obligations.add(item.obligation);
        if (item.status) statuses.add(item.status);
    });

    createFilterCheckboxes('entityFilters', entities, 'entities');
    createFilterCheckboxes('typeFilters', obligations, 'types');
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

    // Start with user-filtered data (based on permissions)
    let baseData = appState.currentUser ? appState.filteredData : appState.data;
    
    const filtered = baseData.filter(item => {
        return selectedEntities.has(item.entity) &&
               selectedTypes.has(item.obligation) &&
               selectedStatuses.has(item.status);
    });

    // Update the displayed data
    const currentFiltered = appState.filteredData;
    appState.filteredData = filtered;

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

// Render table with correct column mapping
function renderTable() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';

    appState.filteredData.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.entity}</td>
            <td>${item.obligation}</td>
            <td>${item.company} - ${item.responsible}</td>
            <td>${formatDate(item.dueDate)}</td>
            <td class="status-cell">
                <span class="status status--${getStatusClass(item.status)}">${item.status}</span>
            </td>
            <td>${item.period} ${item.year}</td>
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
        title: `${item.entity} - ${item.obligation}`,
        date: item.dueDate,
        color: getEventColor(item.status),
        extendedProps: {
            rowIndex: item.rowIndex,
            description: item.obligation,
            status: item.status,
            company: item.company
        }
    }));
}

// Get event color based on status
function getEventColor(status) {
    switch (status?.toLowerCase()) {
        case 'completado': return '#21805C';
        case 'vencido': return '#C0152F';
        case 'en proceso': return '#A84B2F';
        default: return '#626C71';
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
    
    // Populate modal with correct field mapping
    document.getElementById('editEntity').value = record.entity;
    document.getElementById('editType').value = record.obligation;
    document.getElementById('editDescription').value = `${record.company} - ${record.responsible}`;
    document.getElementById('editDueDate').value = record.dueDate;
    document.getElementById('editStatus').value = record.status;
    document.getElementById('editNotes').value = `${record.period} ${record.year}`;

    const modal = document.getElementById('editModal');
    if (modal) modal.classList.remove('hidden');
};

// Setup modal
function setupModal() {
    const editModal = document.getElementById('editModal');
    const loginModal = document.getElementById('loginModal');
    const closeBtn = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelEdit');
    const editForm = document.getElementById('editForm');
    const loginForm = document.getElementById('loginForm');

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    if (editModal) {
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) closeModal();
        });
    }

    if (editForm) editForm.addEventListener('submit', saveRecord);
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    
    // CRITICAL FIX: Add escape key handler to close loading modal if stuck
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (appState.isLoading) {
                appState.setLoading(false);
                AlertManager.warning('Proceso cancelado por el usuario');
            }
        }
    });
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
        appState.setLoading(true, 'Guardando cambios...');

        const updatedData = {
            entity: document.getElementById('editEntity')?.value || '',
            obligation: document.getElementById('editType')?.value || '',
            dueDate: document.getElementById('editDueDate')?.value || '',
            status: document.getElementById('editStatus')?.value || 'Pendiente'
        };

        const recordIndex = appState.data.findIndex(item => item.rowIndex === appState.currentEditingRow);
        if (recordIndex !== -1) {
            Object.assign(appState.data[recordIndex], updatedData);
        }

        if (appState.isSignedIn && appState.currentUser) {
            await safeGoogleSheetsUpdate(appState.currentEditingRow, updatedData);
        }

        // Re-apply user permissions filtering
        filterDataByUserPermissions();
        
        // Re-apply current filters
        applyFilters();
        
        appState.setLoading(false);
        closeModal();
        AlertManager.success('Registro actualizado exitosamente');

    } catch (error) {
        console.error('Error saving record:', error);
        appState.setLoading(false);
        AlertManager.error('Error al guardar: ' + error.message);
    }
}

// Safe Google Sheets update
async function safeGoogleSheetsUpdate(rowIndex, data) {
    try {
        // Update with correct column mapping for DATA sheet
        const values = [
            [data.company || '', data.abbreviation || '', data.responsible || '', 
             data.entity, data.obligation, data.period || '', data.year || '', 
             data.dueDate, data.status]
        ];

        const range = `DATA!A${rowIndex}:I${rowIndex}`;

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
    
    appState.setLoading(false);
    setupModal();
    
    // Load demo data immediately
    loadDemoData();
    
    // Initialize Google APIs with a delay to ensure all scripts are loaded
    setTimeout(() => {
        initializeGoogleAPIs();
    }, 1000);
});