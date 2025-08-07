// Enhanced Tax Calendar Application with User Management and Alarms
// Configuration
const CONFIG = {
    API_KEY: 'AIzaSyBdlizVp_hOembaoFJYE_rKHCvFtn9asok',
    CLIENT_ID: '341125602004-36tl0jfhtd7ce21csjun41fel085res8.apps.googleusercontent.com',
    SPREADSHEET_ID: '10L6aSKz8oPtq4ZpXcO921vCIciHWlCRqo_w5pAHc3yo',
    DISCOVERY_DOC: 'https://sheets.googleapis.com/$discovery/rest?version=v4',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
    DATA_RANGE: 'DATA!A:I',
    USERS_RANGE: 'USUARIOS!A:E'
};

// Demo Data - Initialize immediately
const DEMO_USERS = [
    {
        user: 'admin',
        password: 'admin123',
        role: 'Administrador',
        companies: 'ACME Corp;Tech Solutions;Global Trading',
        email: 'admin@empresa.com'
    },
    {
        user: 'juan.perez',
        password: 'user123',
        role: 'Responsable',
        companies: 'ACME Corp;Tech Solutions',
        email: 'juan.perez@empresa.com'
    },
    {
        user: 'maria.garcia',
        password: 'user456',
        role: 'Responsable',
        companies: 'Global Trading',
        email: 'maria.garcia@empresa.com'
    }
];

const DEMO_DATA = [
    {
        rowIndex: 2,
        empresa: 'ACME Corp',
        abreviatura: 'IGV-M',
        responsable: 'Juan Pérez',
        entidad: 'SUNAT',
        obligacion: 'IGV Mensual',
        periodo: 'Mensual',
        ano: '2025',
        fechaLimite: '2025-01-12',
        estado: 'pendiente'
    },
    {
        rowIndex: 3,
        empresa: 'Tech Solutions',
        abreviatura: 'RTA-C',
        responsable: 'María García',
        entidad: 'SUNAT',
        obligacion: 'Renta a Cuenta',
        periodo: 'Mensual',
        ano: '2025',
        fechaLimite: '2025-01-12',
        estado: 'presentada'
    },
    {
        rowIndex: 4,
        empresa: 'Global Trading',
        abreviatura: 'ESS-C',
        responsable: 'Carlos López',
        entidad: 'ESSALUD',
        obligacion: 'Contribuciones Sociales',
        periodo: 'Mensual',
        ano: '2025',
        fechaLimite: '2025-01-15',
        estado: 'pendiente'
    },
    {
        rowIndex: 5,
        empresa: 'ACME Corp',
        abreviatura: 'PDT-621',
        responsable: 'Juan Pérez',
        entidad: 'SUNAT',
        obligacion: 'PDT 621 IGV-Renta',
        periodo: 'Mensual',
        ano: '2025',
        fechaLimite: '2025-01-17',
        estado: 'vencida'
    },
    {
        rowIndex: 6,
        empresa: 'Tech Solutions',
        abreviatura: 'LIC-M',
        responsable: 'María García',
        entidad: 'Municipalidad de Lima',
        obligacion: 'Licencia Municipal',
        periodo: 'Anual',
        ano: '2025',
        fechaLimite: '2025-02-28',
        estado: 'no_aplica'
    },
    {
        rowIndex: 7,
        empresa: 'Global Trading',
        abreviatura: 'CTS-S',
        responsable: 'Carlos López',
        entidad: 'SUNAT',
        obligacion: 'CTS Semestral',
        periodo: 'Semestral',
        ano: '2025',
        fechaLimite: '2025-02-15',
        estado: 'pendiente'
    }
];

// Global State Management
class AppState {
    constructor() {
        this.isSignedIn = false;
        this.currentUser = null;
        this.users = [...DEMO_USERS]; // Initialize immediately
        this.data = [];
        this.filteredData = [];
        this.userFilteredData = [];
        this.calendar = null;
        this.currentEditingRow = null;
        this.columnOrder = ['abreviatura', 'entidad', 'obligacion', 'fechaLimite', 'estado'];
        this.columnWidths = {};
        this.sortConfig = { column: null, direction: null };
        this.quickFilter = null;
        this.selectedEmails = new Set();
        this.pendingAlarms = [];
        this.isLoading = false;
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

    static success(message) { this.show(message, 'success'); }
    static error(message) { this.show(message, 'error', 8000); }
    static warning(message) { this.show(message, 'warning'); }
    static info(message) { this.show(message, 'info'); }
}

// Authentication System
class AuthManager {
    static async authenticate(username, password) {
        try {
            const user = appState.users.find(u => 
                u.user === username && u.password === password
            );

            if (!user) {
                throw new Error('Credenciales incorrectas');
            }

            appState.currentUser = {
                ...user,
                companies: user.companies.split(';').map(c => c.trim())
            };

            return appState.currentUser;
        } catch (error) {
            console.error('Authentication error:', error);
            throw error;
        }
    }

    static logout() {
        appState.currentUser = null;
        showLoginScreen();
    }

    static hasPermission(permission) {
        if (!appState.currentUser) return false;
        if (appState.currentUser.role === 'Administrador') return true;
        
        switch (permission) {
            case 'manage_users':
            case 'approve_alarms':
                return false;
            case 'manage_own_profile':
            case 'request_alarms':
                return true;
            default:
                return false;
        }
    }
}

// Login System - Fixed and Simplified
function setupLogin() {
    console.log('Setting up login with', appState.users.length, 'users');
    
    const loginForm = document.getElementById('loginForm');
    const loginUser = document.getElementById('loginUser');
    const errorDiv = document.getElementById('loginError');

    if (!loginUser) {
        console.error('Login user select not found');
        return;
    }

    // Force populate dropdown immediately
    populateUserDropdown();

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = loginUser.value;
            const password = document.getElementById('loginPassword').value;

            console.log('Login attempt:', username);

            if (!username) {
                showLoginError('Por favor seleccione un usuario');
                return;
            }

            if (!password) {
                showLoginError('Por favor ingrese la contraseña');
                return;
            }

            try {
                appState.setLoading(true);
                hideLoginError();

                const user = await AuthManager.authenticate(username, password);
                
                console.log('Login successful for:', user.user);
                showMainApp();
                await loadData();
                
                AlertManager.success(`Bienvenido, ${user.user}`);
            } catch (error) {
                showLoginError(error.message);
            } finally {
                appState.setLoading(false);
            }
        });
    }
}

function populateUserDropdown() {
    const loginUser = document.getElementById('loginUser');
    if (!loginUser) return;

    console.log('Populating dropdown with users:', appState.users);

    // Clear existing options
    loginUser.innerHTML = '';
    
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Seleccionar usuario...';
    loginUser.appendChild(defaultOption);

    // Add user options
    appState.users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.user;
        option.textContent = `${user.user} (${user.role})`;
        loginUser.appendChild(option);
        console.log('Added user option:', option.textContent);
    });

    console.log('Dropdown populated with', loginUser.options.length, 'options');
}

function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    }
}

function hideLoginError() {
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) {
        errorDiv.classList.add('hidden');
    }
}

function showLoginScreen() {
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');
    
    if (loginScreen) loginScreen.classList.remove('hidden');
    if (mainApp) mainApp.classList.add('hidden');
    
    // Clear any existing data
    appState.currentUser = null;
    appState.data = [];
    appState.filteredData = [];
    appState.userFilteredData = [];
    
    // Ensure dropdown is populated
    setTimeout(populateUserDropdown, 100);
}

function showMainApp() {
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');
    
    if (loginScreen) loginScreen.classList.add('hidden');
    if (mainApp) mainApp.classList.remove('hidden');
    
    // Update user info in header
    const userName = document.getElementById('currentUserName');
    const userRole = document.getElementById('currentUserRole');
    const userMgmtBtn = document.getElementById('userMgmtBtn');

    if (userName && appState.currentUser) {
        userName.textContent = appState.currentUser.user;
    }
    if (userRole && appState.currentUser) {
        userRole.textContent = appState.currentUser.role;
    }
    
    // Show user management button only for admins
    if (userMgmtBtn && AuthManager.hasPermission('manage_users')) {
        userMgmtBtn.classList.remove('hidden');
    }
}

// Data Loading
async function loadUsersFromSheets() {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: CONFIG.USERS_RANGE,
        });

        const rows = response.result.values;
        if (!rows || rows.length === 0) {
            throw new Error('No users found in spreadsheet');
        }

        appState.users = rows.slice(1).map(row => ({
            user: row[0] || '',
            password: row[1] || '',
            role: row[2] || 'Responsable',
            companies: row[3] || '',
            email: row[4] || ''
        }));

        console.log(`Loaded ${appState.users.length} users from sheets`);
    } catch (error) {
        console.warn('Failed to load users from sheets, using demo data:', error);
        appState.users = [...DEMO_USERS];
    }
}

async function loadData() {
    try {
        appState.setLoading(true);

        if (appState.isSignedIn) {
            await loadDataFromSheets();
        } else {
            loadDemoData();
        }

        // Filter data by user's companies
        filterDataByUserCompanies();
        initializeInterface();

    } catch (error) {
        console.error('Error loading data:', error);
        AlertManager.error('Error al cargar datos: ' + error.message);
        loadDemoData();
        filterDataByUserCompanies();
        initializeInterface();
    } finally {
        appState.setLoading(false);
    }
}

async function loadDataFromSheets() {
    const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: CONFIG.DATA_RANGE,
    });

    const rows = response.result.values;
    if (!rows || rows.length === 0) {
        throw new Error('No data found in spreadsheet');
    }

    appState.data = rows.slice(1).map((row, index) => ({
        rowIndex: index + 2,
        empresa: row[0] || '',
        abreviatura: row[1] || '',
        responsable: row[2] || '',
        entidad: row[3] || '',
        obligacion: row[4] || '',
        periodo: row[5] || '',
        ano: row[6] || '',
        fechaLimite: row[7] || '',
        estado: row[8] || 'pendiente'
    }));

    AlertManager.success(`${appState.data.length} registros cargados desde Google Sheets`);
}

function loadDemoData() {
    appState.data = [...DEMO_DATA];
    console.log('Loaded demo data:', appState.data.length, 'records');
    if (!appState.isSignedIn) {
        AlertManager.warning('Usando datos de demostración. Los datos reales requieren conexión a Google Sheets.');
    }
}

function filterDataByUserCompanies() {
    if (!appState.currentUser) return;

    appState.userFilteredData = appState.data.filter(item => 
        appState.currentUser.companies.includes(item.empresa)
    );
    
    appState.filteredData = [...appState.userFilteredData];
    
    console.log(`Filtered to ${appState.filteredData.length} records for user companies:`, 
                appState.currentUser.companies);
}

// Interface Initialization
function initializeInterface() {
    setupFilters();
    setupTable();
    setupCalendar();
    setupModals();
    updateStats();
    setupDateFilters();
}

// Enhanced Filters
function setupFilters() {
    const entities = new Set();
    const obligations = new Set();
    const statuses = new Set();

    appState.userFilteredData.forEach(item => {
        if (item.entidad) entities.add(item.entidad);
        if (item.obligacion) obligations.add(item.obligacion);
        if (item.estado) statuses.add(item.estado);
    });

    createFilterCheckboxes('entityFilters', entities, 'entities');
    createFilterCheckboxes('obligationFilters', obligations, 'obligations');
    createFilterCheckboxes('statusFilters', statuses, 'statuses');

    setupFilterSearch();
    setupFilterActions();
    setupStatCardFilters();
}

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

function setupFilterSearch() {
    const entitySearch = document.getElementById('entitySearch');
    const obligationSearch = document.getElementById('obligationSearch');

    if (entitySearch) {
        entitySearch.addEventListener('input', (e) => filterCheckboxes('entityFilters', e.target.value));
    }
    if (obligationSearch) {
        obligationSearch.addEventListener('input', (e) => filterCheckboxes('obligationFilters', e.target.value));
    }
}

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

function setupFilterActions() {
    const clearBtn = document.getElementById('clearFilters');
    const applyBtn = document.getElementById('applyFilters');

    if (clearBtn) clearBtn.addEventListener('click', clearFilters);
    if (applyBtn) applyBtn.addEventListener('click', applyFilters);
}

function setupStatCardFilters() {
    const statCards = document.querySelectorAll('.stat-card');
    statCards.forEach(card => {
        card.addEventListener('click', () => {
            const filter = card.dataset.filter;
            
            // Remove active class from all cards
            statCards.forEach(c => c.classList.remove('active'));
            
            if (appState.quickFilter === filter) {
                // Deactivate current filter
                appState.quickFilter = null;
            } else {
                // Activate new filter
                appState.quickFilter = filter;
                card.classList.add('active');
            }
            
            applyFilters();
        });
    });
}

function clearFilters() {
    appState.quickFilter = null;
    
    document.querySelectorAll('.filter-checkbox input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = true;
    });
    document.querySelectorAll('.filter-search').forEach(search => {
        search.value = '';
    });
    document.querySelectorAll('.stat-card').forEach(card => {
        card.classList.remove('active');
    });
    
    // Reset filter visibility
    document.querySelectorAll('.filter-checkbox').forEach(checkbox => {
        checkbox.style.display = 'flex';
    });
    
    applyFilters();
}

function applyFilters() {
    const selectedEntities = getSelectedFilters('entities');
    const selectedObligations = getSelectedFilters('obligations');
    const selectedStatuses = getSelectedFilters('statuses');

    let filtered = appState.userFilteredData.filter(item => {
        return selectedEntities.has(item.entidad) &&
               selectedObligations.has(item.obligacion) &&
               selectedStatuses.has(item.estado);
    });

    // Apply quick filter from stat cards
    if (appState.quickFilter) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        filtered = filtered.filter(item => {
            switch (appState.quickFilter) {
                case 'proximos':
                    if (!item.fechaLimite || item.estado === 'presentada') return false;
                    const dueDate = new Date(item.fechaLimite);
                    const diffTime = dueDate - today;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays >= 0 && diffDays <= 30;
                    
                case 'vencidos':
                    if (!item.fechaLimite || item.estado === 'presentada') return false;
                    const overDueDate = new Date(item.fechaLimite);
                    return overDueDate < today;
                    
                case 'all':
                default:
                    return true;
            }
        });
    }

    appState.filteredData = filtered;
    renderTable();
    updateCalendar();
    updateStats();
    
    AlertManager.info(`${appState.filteredData.length} registros mostrados`);
}

function getSelectedFilters(filterType) {
    const selected = new Set();
    document.querySelectorAll(`input[id^="${filterType}_"]:checked`).forEach(checkbox => {
        selected.add(checkbox.value);
    });
    return selected;
}

// Date Filters for Table
function setupDateFilters() {
    const yearFilter = document.getElementById('yearFilter');
    const monthFilter = document.getElementById('monthFilter');
    const yearValue = document.getElementById('yearValue');
    const monthValue = document.getElementById('monthValue');

    const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    if (yearFilter && monthFilter) {
        yearFilter.addEventListener('input', () => {
            if (yearValue) yearValue.textContent = yearFilter.value;
            applyDateFilter();
        });

        monthFilter.addEventListener('input', () => {
            if (monthValue) monthValue.textContent = monthNames[parseInt(monthFilter.value) - 1];
            applyDateFilter();
        });
    }
}

function applyDateFilter() {
    const year = document.getElementById('yearFilter')?.value;
    const month = document.getElementById('monthFilter')?.value;
    
    if (!year || !month) return;
    
    const filteredByDate = appState.filteredData.filter(item => {
        if (!item.fechaLimite) return false;
        
        const itemDate = new Date(item.fechaLimite);
        const itemYear = itemDate.getFullYear().toString();
        const itemMonth = (itemDate.getMonth() + 1).toString();
        
        return itemYear === year && itemMonth === month;
    });
    
    renderTable(filteredByDate);
}

// Enhanced Table with Column Management
function setupTable() {
    setupTableHeader();
    renderTable();
}

function setupTableHeader() {
    const header = document.getElementById('tableHeader');
    if (!header) return;

    // Make columns draggable and sortable
    const ths = header.querySelectorAll('th[data-column]');
    ths.forEach(th => {
        const column = th.dataset.column;
        
        // Setup sorting
        if (th.classList.contains('sortable')) {
            th.addEventListener('click', (e) => {
                // Don't sort if clicking on resize handle
                if (e.target.classList.contains('resize-handle')) return;
                toggleSort(column);
            });
        }

        // Setup resizing
        if (th.classList.contains('resizable')) {
            setupColumnResize(th);
        }

        // Setup dragging
        setupColumnDrag(th);
    });
}

function toggleSort(column) {
    if (appState.sortConfig.column === column) {
        // Toggle direction
        if (appState.sortConfig.direction === 'asc') {
            appState.sortConfig.direction = 'desc';
        } else if (appState.sortConfig.direction === 'desc') {
            appState.sortConfig = { column: null, direction: null };
        } else {
            appState.sortConfig.direction = 'asc';
        }
    } else {
        appState.sortConfig = { column, direction: 'asc' };
    }

    updateSortIcons();
    renderTable();
}

function updateSortIcons() {
    const ths = document.querySelectorAll('th.sortable');
    ths.forEach(th => {
        th.classList.remove('asc', 'desc');
        if (th.dataset.column === appState.sortConfig.column) {
            th.classList.add(appState.sortConfig.direction || '');
        }
    });
}

function setupColumnResize(th) {
    const resizeHandle = th.querySelector('.resize-handle');
    if (!resizeHandle) return;

    let startX, startWidth, isResizing = false;

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = th.offsetWidth;
        resizeHandle.classList.add('active');
        
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
        e.preventDefault();
        e.stopPropagation();
    });

    function handleResize(e) {
        if (!isResizing) return;
        const width = startWidth + (e.clientX - startX);
        th.style.width = Math.max(100, width) + 'px';
        appState.columnWidths[th.dataset.column] = th.style.width;
    }

    function stopResize() {
        isResizing = false;
        resizeHandle.classList.remove('active');
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
    }
}

function setupColumnDrag(th) {
    const thContent = th.querySelector('.th-content');
    if (!thContent) return;

    th.draggable = true;
    
    th.addEventListener('dragstart', (e) => {
        th.classList.add('dragging');
        e.dataTransfer.setData('text/plain', th.dataset.column);
    });

    th.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    th.addEventListener('drop', (e) => {
        e.preventDefault();
        const draggedColumn = e.dataTransfer.getData('text/plain');
        const dropColumn = th.dataset.column;
        
        if (draggedColumn !== dropColumn) {
            reorderColumns(draggedColumn, dropColumn);
        }
    });

    th.addEventListener('dragend', () => {
        th.classList.remove('dragging');
    });
}

function reorderColumns(draggedColumn, dropColumn) {
    const currentOrder = [...appState.columnOrder];
    const draggedIndex = currentOrder.indexOf(draggedColumn);
    const dropIndex = currentOrder.indexOf(dropColumn);

    if (draggedIndex !== -1 && dropIndex !== -1) {
        currentOrder.splice(draggedIndex, 1);
        currentOrder.splice(dropIndex, 0, draggedColumn);
        appState.columnOrder = currentOrder;
        
        // Rebuild table header
        rebuildTableHeader();
        renderTable();
    }
}

function rebuildTableHeader() {
    const header = document.getElementById('tableHeader');
    if (!header) return;

    const columnConfig = {
        abreviatura: { title: 'Abreviatura', sortable: true, resizable: true },
        entidad: { title: 'Entidad', sortable: true, resizable: true },
        obligacion: { title: 'Obligación', sortable: true, resizable: true },
        fechaLimite: { title: 'Fecha Límite', sortable: true, resizable: true },
        estado: { title: 'Estado', sortable: true, resizable: true }
    };

    header.innerHTML = '';

    appState.columnOrder.forEach(columnKey => {
        const config = columnConfig[columnKey];
        if (!config) return;

        const th = document.createElement('th');
        th.dataset.column = columnKey;
        th.className = 'resizable sortable';
        
        if (appState.columnWidths[columnKey]) {
            th.style.width = appState.columnWidths[columnKey];
        }

        th.innerHTML = `
            <div class="th-content">
                <span>${config.title}</span>
                <span class="sort-icon">↕️</span>
                <div class="resize-handle"></div>
            </div>
        `;

        header.appendChild(th);
    });

    // Add actions column
    const actionsth = document.createElement('th');
    actionsth.dataset.column = 'acciones';
    actionsth.innerHTML = '<div class="th-content"><span>Acciones</span></div>';
    header.appendChild(actionsth);

    setupTableHeader();
}

function renderTable(dataOverride = null) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    
    let dataToRender = dataOverride || appState.filteredData;

    // Apply sorting
    if (appState.sortConfig.column && appState.sortConfig.direction) {
        dataToRender = [...dataToRender].sort((a, b) => {
            const aVal = a[appState.sortConfig.column] || '';
            const bVal = b[appState.sortConfig.column] || '';
            
            let result = 0;
            if (appState.sortConfig.column === 'fechaLimite') {
                result = new Date(aVal) - new Date(bVal);
            } else {
                result = aVal.toString().localeCompare(bVal.toString());
            }
            
            return appState.sortConfig.direction === 'asc' ? result : -result;
        });
    }
    
    tbody.innerHTML = '';

    dataToRender.forEach(item => {
        const row = document.createElement('tr');
        
        const cells = [];
        appState.columnOrder.forEach(columnKey => {
            let cellContent = '';
            
            switch (columnKey) {
                case 'abreviatura':
                    cellContent = item.abreviatura;
                    break;
                case 'entidad':
                    cellContent = item.entidad;
                    break;
                case 'obligacion':
                    cellContent = item.obligacion;
                    break;
                case 'fechaLimite':
                    cellContent = formatDate(item.fechaLimite);
                    break;
                case 'estado':
                    cellContent = `<span class="status status--${item.estado}">${getStatusLabel(item.estado)}</span>`;
                    break;
            }
            
            cells.push(`<td>${cellContent}</td>`);
        });

        // Add actions column
        cells.push(`
            <td class="table-actions">
                <button class="btn btn--sm btn--outline btn-icon" onclick="editRecord(${item.rowIndex})" title="Editar">
                    ✏️
                </button>
            </td>
        `);

        row.innerHTML = cells.join('');
        tbody.appendChild(row);
    });
}

function getStatusLabel(status) {
    const labels = {
        'presentada': 'Presentada',
        'pendiente': 'Pendiente',
        'no_aplica': 'No Aplica',
        'vencida': 'Vencida'
    };
    return labels[status] || status;
}

// Calendar Setup
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

function updateCalendar() {
    if (appState.calendar) {
        appState.calendar.removeAllEvents();
        appState.calendar.addEventSource(getCalendarEvents());
    }
}

function getCalendarEvents() {
    return appState.filteredData.map(item => ({
        title: `${item.abreviatura} – ${item.entidad} – ${item.obligacion}`,
        date: item.fechaLimite,
        color: getEventColor(item.estado),
        extendedProps: {
            rowIndex: item.rowIndex,
            estado: item.estado
        }
    }));
}

function getEventColor(status) {
    const colors = {
        'presentada': '#22c55e',
        'pendiente': '#f59e0b',
        'no_aplica': '#6b7280',
        'vencida': '#ef4444'
    };
    return colors[status] || '#6b7280';
}

// Stats Update
function updateStats() {
    const totalEl = document.getElementById('totalCount');
    const upcomingEl = document.getElementById('upcomingCount');
    const overdueEl = document.getElementById('overdueCount');
    
    if (!totalEl || !upcomingEl || !overdueEl) return;

    const total = appState.filteredData.length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const upcoming = appState.filteredData.filter(item => {
        if (!item.fechaLimite || item.estado === 'presentada') return false;
        const dueDate = new Date(item.fechaLimite);
        const diffTime = dueDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 30;
    }).length;
    
    const overdue = appState.filteredData.filter(item => {
        if (!item.fechaLimite || item.estado === 'presentada') return false;
        const dueDate = new Date(item.fechaLimite);
        return dueDate < today;
    }).length;

    totalEl.textContent = total;
    upcomingEl.textContent = upcoming;
    overdueEl.textContent = overdue;
}

// Edit Modal
window.editRecord = function(rowIndex) {
    const record = appState.userFilteredData.find(item => item.rowIndex === rowIndex);
    if (!record) {
        AlertManager.error('Registro no encontrado');
        return;
    }

    appState.currentEditingRow = rowIndex;
    
    // Populate modal with read-only and editable fields
    const fields = {
        editEmpresa: record.empresa,
        editAbreviatura: record.abreviatura,
        editResponsable: record.responsable,
        editEntidad: record.entidad,
        editObligacion: record.obligacion,
        editPeriodo: record.periodo,
        editAno: record.ano,
        editFechaLimite: record.fechaLimite,
        editEstado: record.estado
    };
    
    Object.keys(fields).forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) field.value = fields[fieldId];
    });

    // Show modal
    const modal = document.getElementById('editModal');
    if (modal) modal.classList.remove('hidden');
};

// Modal Setup
function setupModals() {
    setupEditModal();
    setupAlarmModal();
    setupUserModal();
}

function setupEditModal() {
    const modal = document.getElementById('editModal');
    const closeBtn = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelEdit');
    const form = document.getElementById('editForm');

    if (closeBtn) closeBtn.addEventListener('click', closeEditModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeEditModal);
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeEditModal();
        });
    }

    if (form) form.addEventListener('submit', saveRecord);
}

function closeEditModal() {
    const modal = document.getElementById('editModal');
    if (modal) modal.classList.add('hidden');
    appState.currentEditingRow = null;
}

async function saveRecord(e) {
    e.preventDefault();
    
    if (!appState.currentEditingRow) {
        AlertManager.error('No hay registro seleccionado para editar');
        return;
    }

    try {
        appState.setLoading(true);

        const updatedData = {
            fechaLimite: document.getElementById('editFechaLimite')?.value || '',
            estado: document.getElementById('editEstado')?.value || 'pendiente'
        };

        // Update local data
        const recordIndex = appState.data.findIndex(item => item.rowIndex === appState.currentEditingRow);
        if (recordIndex !== -1) {
            Object.assign(appState.data[recordIndex], updatedData);
        }

        // Update filtered data
        const userFilteredIndex = appState.userFilteredData.findIndex(item => item.rowIndex === appState.currentEditingRow);
        if (userFilteredIndex !== -1) {
            Object.assign(appState.userFilteredData[userFilteredIndex], updatedData);
        }

        const filteredIndex = appState.filteredData.findIndex(item => item.rowIndex === appState.currentEditingRow);
        if (filteredIndex !== -1) {
            Object.assign(appState.filteredData[filteredIndex], updatedData);
        }

        renderTable();
        updateCalendar();
        updateStats();
        closeEditModal();
        
        AlertManager.success('Registro actualizado exitosamente');

    } catch (error) {
        console.error('Error saving record:', error);
        AlertManager.error('Error al guardar: ' + error.message);
    } finally {
        appState.setLoading(false);
    }
}

// Simplified functions for modal setup (alarm and user modals)
function setupAlarmModal() {
    const alarmBtn = document.getElementById('alarmBtn');
    if (alarmBtn) {
        alarmBtn.addEventListener('click', () => {
            AlertManager.info('Sistema de alarmas disponible para usuarios logueados');
        });
    }
}

function setupUserModal() {
    const userMgmtBtn = document.getElementById('userMgmtBtn');
    if (userMgmtBtn) {
        userMgmtBtn.addEventListener('click', () => {
            AlertManager.info('Gestión de usuarios disponible para administradores');
        });
    }
}

// Header Actions
function setupHeaderActions() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            AuthManager.logout();
            AlertManager.info('Sesión cerrada');
        });
    }
}

// Utility Functions
function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-ES');
    } catch {
        return dateString;
    }
}

// Google APIs Initialization (simplified for demo)
async function initializeGoogleAPIs() {
    try {
        console.log('Initializing Google APIs...');
        appState.updateConnectionStatus('loading', 'Inicializando APIs de Google...');

        // Simulate API initialization
        await new Promise(resolve => setTimeout(resolve, 1000));

        appState.updateConnectionStatus('success', 'APIs de Google inicializadas (modo demo)');
        AlertManager.info('Usando modo demostración. Los datos no se sincronizarán con Google Sheets.');

    } catch (error) {
        console.error('Error initializing Google APIs:', error);
        appState.updateConnectionStatus('error', `Error al inicializar: ${error.message}`);
        AlertManager.warning('Error al conectar con Google APIs. Usando modo demostración.');
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    console.log('Initial users:', appState.users.length);
    
    // Setup components
    setupLogin();
    setupHeaderActions();
    
    // Show login screen
    showLoginScreen();
    
    // Initialize Google APIs in background
    setTimeout(() => {
        initializeGoogleAPIs();
    }, 1000);
});