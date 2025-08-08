// Enhanced Google Sheets Tax Calendar Application - Fixed Version
// Production Configuration
const CONFIG = {
    API_KEY: 'AIzaSyBdlizVp_hOembaoFJYE_rKHCvFtn9asok',
    CLIENT_ID: '341125602004-36tl0jfhtd7ce21csjun41fel085res8.apps.googleusercontent.com',
    SPREADSHEET_ID: '10L6aSKz8oPtq4ZpXcO921vCIciHWlCRqo_w5pAHc3yo',
    DISCOVERY_DOC: 'https://sheets.googleapis.com/$discovery/rest?version=v4',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
    RANGE: 'Sheet1!A:L'
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
            empresas: new Set(),
            entities: new Set(),
            responsables: new Set(),
            obligaciones: new Set(),
            statuses: new Set()
        };
        this.calendar = null;
        this.currentEditingRow = null;
        this.initializationAttempts = 0;
        this.maxInitAttempts = 3;
        this.alarms = [];
        this.sortConfig = [];
        this.columnWidths = {};
        this.columnOrder = ['abreviatura', 'entidad', 'obligacion', 'periodo', 'fecha_limite', 'estado'];
        this.activeStatFilter = null;
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

// Alarm Management System
class AlarmManager {
    constructor() {
        this.alarms = [];
        this.emails = [];
    }

    init() {
        this.setupAlarmModal();
        this.loadAlarms();
    }

    setupAlarmModal() {
        const alarmBtn = document.getElementById('alarmManagementBtn');
        const modal = document.getElementById('alarmModal');
        const closeBtn = document.getElementById('closeAlarmModal');
        
        if (alarmBtn) {
            alarmBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openModal();
            });
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeModal());
        }
        
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModal();
            });
        }

        this.setupTabs();
        this.setupAlarmForm();
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.alarm-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const targetTab = e.target.dataset.tab;
                this.switchTab(targetTab);
            });
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.alarm-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.alarm-tab-content').forEach(content => content.classList.remove('active'));
        
        const targetTab = document.querySelector(`[data-tab="${tabName}"]`);
        const targetContent = document.getElementById(`${tabName}AlarmTab`);
        
        if (targetTab) targetTab.classList.add('active');
        if (targetContent) targetContent.classList.add('active');

        if (tabName === 'list') {
            this.renderAlarmList();
        }
    }

    setupAlarmForm() {
        const form = document.getElementById('alarmForm');
        const addEmailBtn = document.getElementById('addEmailBtn');
        const testBtn = document.getElementById('testAlarmBtn');

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.createAlarm(e);
            });
        }
        
        if (addEmailBtn) {
            addEmailBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.addEmail();
            });
        }
        
        if (testBtn) {
            testBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.testAlarm();
            });
        }

        this.populateAlarmSelects();
        this.setupEmailInput();
    }

    populateAlarmSelects() {
        const entitySelect = document.getElementById('alarmEntity');
        const obligacionSelect = document.getElementById('alarmObligacion');

        if (!entitySelect || !obligacionSelect) return;

        // Clear existing options
        entitySelect.innerHTML = '<option value="">Seleccionar entidad</option>';
        obligacionSelect.innerHTML = '<option value="">Seleccionar obligación</option>';

        // Populate with unique values from data
        const entities = new Set();
        const obligaciones = new Set();

        appState.data.forEach(item => {
            if (item.entidad) entities.add(item.entidad);
            if (item.obligacion) obligaciones.add(item.obligacion);
        });

        Array.from(entities).sort().forEach(entity => {
            const option = document.createElement('option');
            option.value = entity;
            option.textContent = entity;
            entitySelect.appendChild(option);
        });

        Array.from(obligaciones).sort().forEach(obligacion => {
            const option = document.createElement('option');
            option.value = obligacion;
            option.textContent = obligacion;
            obligacionSelect.appendChild(option);
        });
    }

    setupEmailInput() {
        const emailInput = document.getElementById('emailInput');
        if (emailInput) {
            emailInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addEmail();
                }
            });
        }
    }

    addEmail() {
        const emailInput = document.getElementById('emailInput');
        const emailList = document.getElementById('emailList');

        if (!emailInput || !emailList) return;

        const email = emailInput.value.trim();
        if (!email || !this.isValidEmail(email)) {
            AlertManager.error('Por favor ingrese un correo electrónico válido');
            return;
        }

        if (this.emails.includes(email)) {
            AlertManager.warning('Este correo ya ha sido agregado');
            return;
        }

        this.emails.push(email);
        this.renderEmailList();
        emailInput.value = '';
    }

    renderEmailList() {
        const emailList = document.getElementById('emailList');
        if (!emailList) return;

        emailList.innerHTML = this.emails.map(email => `
            <div class="email-tag" data-email="${email}">
                <span>${email}</span>
                <button type="button" class="email-tag-remove" onclick="alarmManager.removeEmail('${email}')">&times;</button>
            </div>
        `).join('');
    }

    removeEmail(email) {
        this.emails = this.emails.filter(e => e !== email);
        this.renderEmailList();
    }

    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    createAlarm(e) {
        e.preventDefault();

        if (this.emails.length === 0) {
            AlertManager.error('Por favor agregue al menos un correo electrónico');
            return;
        }

        const entidad = document.getElementById('alarmEntity').value;
        const obligacion = document.getElementById('alarmObligacion').value;
        const daysBefore = parseInt(document.getElementById('alarmDaysBefore').value);
        const frequency = parseInt(document.getElementById('alarmFrequency').value);
        const message = document.getElementById('alarmMessage').value;

        if (!entidad || !obligacion) {
            AlertManager.error('Por favor seleccione entidad y obligación');
            return;
        }

        const alarm = {
            id: Date.now(),
            entidad,
            obligacion,
            daysBefore,
            frequency,
            emails: [...this.emails],
            message,
            active: true,
            createdAt: new Date().toISOString()
        };

        this.alarms.push(alarm);
        this.saveAlarms();
        AlertManager.success('Alarma creada exitosamente');
        this.resetForm();
        this.switchTab('list');
    }

    testAlarm() {
        if (this.emails.length === 0) {
            AlertManager.error('Por favor agregue al menos un correo electrónico para probar');
            return;
        }

        AlertManager.info(`Alarma de prueba enviada a: ${this.emails.join(', ')}`);
    }

    resetForm() {
        const form = document.getElementById('alarmForm');
        if (form) form.reset();
        
        this.emails = [];
        this.renderEmailList();
        
        document.getElementById('alarmDaysBefore').value = '8';
        document.getElementById('alarmFrequency').value = '2';
    }

    renderAlarmList() {
        const alarmList = document.getElementById('alarmList');
        const alarmCount = document.getElementById('alarmCount');

        if (!alarmList || !alarmCount) return;

        alarmCount.textContent = this.alarms.length;

        if (this.alarms.length === 0) {
            alarmList.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">No hay alarmas configuradas</p>';
            return;
        }

        alarmList.innerHTML = this.alarms.map(alarm => `
            <div class="alarm-item">
                <div class="alarm-info">
                    <h6>${alarm.entidad} - ${alarm.obligacion}</h6>
                    <div class="alarm-details">
                        ${alarm.daysBefore} días antes, cada ${alarm.frequency} días
                    </div>
                    <div class="alarm-emails">
                        Correos: ${alarm.emails.join(', ')}
                    </div>
                </div>
                <div class="alarm-actions">
                    <button class="btn btn--sm btn--outline" onclick="alarmManager.toggleAlarm(${alarm.id})">
                        ${alarm.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button class="btn btn--sm btn--outline" onclick="alarmManager.deleteAlarm(${alarm.id})">
                        Eliminar
                    </button>
                </div>
            </div>
        `).join('');
    }

    toggleAlarm(id) {
        const alarm = this.alarms.find(a => a.id === id);
        if (alarm) {
            alarm.active = !alarm.active;
            this.saveAlarms();
            this.renderAlarmList();
            AlertManager.success(`Alarma ${alarm.active ? 'activada' : 'desactivada'}`);
        }
    }

    deleteAlarm(id) {
        if (confirm('¿Está seguro de que desea eliminar esta alarma?')) {
            this.alarms = this.alarms.filter(a => a.id !== id);
            this.saveAlarms();
            this.renderAlarmList();
            AlertManager.success('Alarma eliminada');
        }
    }

    openModal() {
        const modal = document.getElementById('alarmModal');
        if (modal) {
            modal.classList.remove('hidden');
            this.populateAlarmSelects();
        }
    }

    closeModal() {
        const modal = document.getElementById('alarmModal');
        if (modal) modal.classList.add('hidden');
    }

    saveAlarms() {
        // In a real application, this would save to a backend
        console.log('Alarms saved:', this.alarms);
    }

    loadAlarms() {
        // In a real application, this would load from a backend
        this.alarms = [];
    }
}

// Initialize alarm manager
const alarmManager = new AlarmManager();

// Google APIs Initialization
async function initializeGoogleAPIs() {
    try {
        console.log('Initializing Google APIs... Attempt:', appState.initializationAttempts + 1);
        appState.initializationAttempts++;
        appState.updateConnectionStatus('loading', 'Inicializando APIs de Google...');

        if (appState.initializationAttempts > appState.maxInitAttempts) {
            throw new Error('Se agotaron los intentos de conexión');
        }

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

function handleCredentialResponse(response) {
    console.log('Credential response received');
    handleAuthClick();
}

function setupAuthButton() {
    const authBtn = document.getElementById('authBtn');
    const signoutBtn = document.getElementById('signoutBtn');
    const retryBtn = document.getElementById('retryBtn');

    if (authBtn) authBtn.addEventListener('click', handleAuthClick);
    if (signoutBtn) signoutBtn.addEventListener('click', handleSignoutClick);
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            appState.updateConnectionStatus('loading', 'Reintentando conexión...');
            appState.initializationAttempts = 0;
            initializeGoogleAPIs();
        });
    }

    updateAuthUI();
}

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
    loadDemoData();
    appState.updateConnectionStatus('info', 'Desconectado de Google Sheets');
    AlertManager.info('Sesión cerrada. Mostrando datos de demostración.');
}

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

        const headers = rows[0];
        appState.data = rows.slice(1).map((row, index) => ({
            rowIndex: index + 2,
            abreviatura: row[0] || '',
            entidad: row[1] || '',
            obligacion: row[2] || '',
            periodo: row[3] || '',
            fecha_limite: row[4] || '',
            estado: row[5] || 'Pendiente',
            empresa: row[6] || '',
            responsable: row[7] || '',
            notas: row[8] || '',
            fecha_presentacion: row[9] || '',
            monto: row[10] || '',
            observaciones: row[11] || ''
        }));

        console.log(`Loaded ${appState.data.length} records`);
        appState.filteredData = [...appState.data];
        
        initializeInterface();
        AlertManager.success(`${appState.data.length} obligaciones cargadas desde Google Sheets`);

    } catch (error) {
        console.error('Error loading data:', error);
        AlertManager.error('Error al cargar datos de Google Sheets: ' + error.message + '. Usando datos de demostración.');
        loadDemoData();
    } finally {
        appState.setLoading(false);
    }
}

function loadDemoData() {
    console.log('Loading demo data...');
    
    appState.data = [
        {
            rowIndex: 2,
            abreviatura: 'SUNAT-IGV',
            entidad: 'SUNAT',
            obligacion: 'Declaración mensual de IGV',
            periodo: '2025-01',
            fecha_limite: '2025-01-12',
            estado: 'Pendiente',
            empresa: 'Empresa ABC',
            responsable: 'Contador',
            notas: 'Revisar facturas del mes anterior',
            fecha_presentacion: '2025-01-12',
            monto: '15000',
            observaciones: 'Prioridad alta'
        },
        {
            rowIndex: 3,
            abreviatura: 'SUNAT-RTA',
            entidad: 'SUNAT',
            obligacion: 'Pago a cuenta de Impuesto a la Renta',
            periodo: '2025-01',
            fecha_limite: '2025-01-12',
            estado: 'En Proceso',
            empresa: 'Empresa ABC',
            responsable: 'Gerencia',
            notas: 'En preparación',
            fecha_presentacion: '2025-01-12',
            monto: '8500',
            observaciones: 'Calculando base imponible'
        },
        {
            rowIndex: 4,
            abreviatura: 'ESS-CONTR',
            entidad: 'ESSALUD',
            obligacion: 'Declaración y pago de contribuciones',
            periodo: '2025-01',
            fecha_limite: '2025-01-15',
            estado: 'Pendiente',
            empresa: 'Empresa ABC',
            responsable: 'RRHH',
            notas: 'Incluir nuevos empleados',
            fecha_presentacion: '2025-01-15',
            monto: '3200',
            observaciones: 'Verificar planilla'
        },
        {
            rowIndex: 5,
            abreviatura: 'SUNAT-PDT',
            entidad: 'SUNAT',
            obligacion: 'Presentación de PDT 621',
            periodo: '2024-12',
            fecha_limite: '2025-01-17',
            estado: 'Completado',
            empresa: 'Empresa ABC',
            responsable: 'Contador',
            notas: 'Presentado correctamente',
            fecha_presentacion: '2025-01-16',
            monto: '2500',
            observaciones: 'Sin observaciones'
        },
        {
            rowIndex: 6,
            abreviatura: 'MUN-LIC',
            entidad: 'Municipalidad',
            obligacion: 'Renovación de licencia municipal',
            periodo: '2025',
            fecha_limite: '2025-01-20',
            estado: 'Vencido',
            empresa: 'Empresa ABC',
            responsable: 'Legal',
            notas: 'Pendiente de documentos',
            fecha_presentacion: '2025-01-20',
            monto: '850',
            observaciones: 'Crítico - requiere atención inmediata'
        }
    ];

    appState.filteredData = [...appState.data];
    initializeInterface();
    
    if (!appState.isSignedIn) {
        AlertManager.warning('Usando datos de demostración. Conéctate a Google Sheets para datos reales.');
    }
    appState.setLoading(false);
}

function initializeInterface() {
    setupFilters();
    setupYearFilter();
    renderTable();
    setupCalendar();
    updateStats();
    setupTableFeatures();
    setupStatFilters();
}

function setupFilters() {
    const empresas = new Set();
    const entities = new Set();
    const responsables = new Set();
    const obligaciones = new Set();
    const statuses = new Set();

    appState.data.forEach(item => {
        if (item.empresa) empresas.add(item.empresa);
        if (item.entidad) entities.add(item.entidad);
        if (item.responsable) responsables.add(item.responsable);
        if (item.obligacion) obligaciones.add(item.obligacion);
        if (item.estado) statuses.add(item.estado);
    });

    createFilterCheckboxes('empresaFilters', empresas, 'empresas');
    createFilterCheckboxes('entityFilters', entities, 'entities');
    createFilterCheckboxes('responsableFilters', responsables, 'responsables');
    createFilterCheckboxes('obligacionFilters', obligaciones, 'obligaciones');
    createFilterCheckboxes('statusFilters', statuses, 'statuses');

    setupFilterSearch();
    setupFilterActions();
}

function setupYearFilter() {
    const yearFilter = document.getElementById('yearFilter');
    const monthFilter = document.getElementById('monthFilter');

    if (!yearFilter || !monthFilter) return;

    // Populate year filter with years from data
    const years = new Set();
    appState.data.forEach(item => {
        if (item.fecha_limite) {
            const year = new Date(item.fecha_limite).getFullYear();
            if (!isNaN(year)) years.add(year);
        }
    });

    Array.from(years).sort().forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearFilter.appendChild(option);
    });

    // Add event listeners for date filtering
    yearFilter.addEventListener('change', applyDateFilter);
    monthFilter.addEventListener('change', applyDateFilter);
}

function applyDateFilter() {
    const yearFilter = document.getElementById('yearFilter');
    const monthFilter = document.getElementById('monthFilter');

    if (!yearFilter || !monthFilter) return;

    const selectedYear = yearFilter.value;
    const selectedMonth = monthFilter.value;

    if (!selectedYear && !selectedMonth) {
        // No date filter applied
        applyFilters();
        return;
    }

    // Apply date filter to current filtered data
    let dateFilteredData = appState.filteredData;

    if (selectedYear || selectedMonth) {
        dateFilteredData = appState.filteredData.filter(item => {
            if (!item.fecha_limite) return false;
            
            const itemDate = new Date(item.fecha_limite);
            if (isNaN(itemDate)) return false;

            let matches = true;
            
            if (selectedYear) {
                matches = matches && itemDate.getFullYear() === parseInt(selectedYear);
            }
            
            if (selectedMonth) {
                matches = matches && (itemDate.getMonth() + 1) === parseInt(selectedMonth);
            }

            return matches;
        });
    }

    // Update table with date filtered data
    renderTableWithData(dateFilteredData);
    AlertManager.info(`${dateFilteredData.length} registros después del filtro de fecha`);
}

function createFilterCheckboxes(containerId, items, filterType) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';

    Array.from(items).sort().forEach(item => {
        const div = document.createElement('div');
        div.className = 'filter-checkbox';
        const safeId = `${filterType}_${item.replace(/[^a-zA-Z0-9]/g, '_')}`;
        div.innerHTML = `
            <input type="checkbox" id="${safeId}" value="${item}" checked>
            <label for="${safeId}">${item}</label>
        `;
        
        const checkbox = div.querySelector('input');
        checkbox.addEventListener('change', applyFilters);
        
        container.appendChild(div);
    });
}

function setupFilterSearch() {
    const searchInputs = [
        { id: 'empresaSearch', container: 'empresaFilters' },
        { id: 'entitySearch', container: 'entityFilters' },
        { id: 'responsableSearch', container: 'responsableFilters' },
        { id: 'obligacionSearch', container: 'obligacionFilters' }
    ];

    searchInputs.forEach(({id, container}) => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', (e) => filterCheckboxes(container, e.target.value));
        }
    });
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

function clearFilters() {
    // Clear all checkboxes
    document.querySelectorAll('.filter-checkbox input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = true;
    });
    
    // Clear search inputs
    document.querySelectorAll('.filter-search').forEach(search => {
        search.value = '';
    });
    
    // Clear date filters
    const yearFilter = document.getElementById('yearFilter');
    const monthFilter = document.getElementById('monthFilter');
    if (yearFilter) yearFilter.value = '';
    if (monthFilter) monthFilter.value = '';
    
    // Reset filter visibility
    document.querySelectorAll('.filter-checkbox').forEach(checkbox => {
        checkbox.style.display = 'flex';
    });
    
    // Clear active stat filter
    appState.activeStatFilter = null;
    document.querySelectorAll('.stat-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    applyFilters();
}

function applyFilters() {
    const selectedEmpresas = getSelectedFilters('empresas');
    const selectedEntities = getSelectedFilters('entities');
    const selectedResponsables = getSelectedFilters('responsables');
    const selectedObligaciones = getSelectedFilters('obligaciones');
    const selectedStatuses = getSelectedFilters('statuses');

    appState.filteredData = appState.data.filter(item => {
        let matches = selectedEmpresas.has(item.empresa) &&
                     selectedEntities.has(item.entidad) &&
                     selectedResponsables.has(item.responsable) &&
                     selectedObligaciones.has(item.obligacion) &&
                     selectedStatuses.has(item.estado);

        // Apply stat filter if active
        if (appState.activeStatFilter) {
            matches = matches && applyStatFilter(item, appState.activeStatFilter);
        }

        return matches;
    });

    renderTable();
    updateCalendar();
    updateStats();
    applyDateFilter(); // Apply date filter after regular filters
}

function getSelectedFilters(filterType) {
    const selected = new Set();
    document.querySelectorAll(`input[id*="${filterType}_"]:checked`).forEach(checkbox => {
        selected.add(checkbox.value);
    });
    return selected;
}

function setupStatFilters() {
    const statButtons = document.querySelectorAll('.stat-button');
    statButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const filterType = e.currentTarget.dataset.filter;
            
            // Toggle active state
            if (appState.activeStatFilter === filterType) {
                appState.activeStatFilter = null;
                button.classList.remove('active');
            } else {
                document.querySelectorAll('.stat-button').forEach(btn => btn.classList.remove('active'));
                appState.activeStatFilter = filterType;
                button.classList.add('active');
            }
            
            applyFilters();
        });
    });
}

function applyStatFilter(item, filterType) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch (filterType) {
        case 'upcoming':
            if (!item.fecha_limite || item.estado === 'Completado') return false;
            const dueDate = new Date(item.fecha_limite);
            const diffTime = dueDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays >= 0 && diffDays <= 7;
            
        case 'overdue':
            if (!item.fecha_limite || item.estado === 'Completado') return false;
            return new Date(item.fecha_limite) < today;
            
        case 'total':
        default:
            return true;
    }
}

function renderTable() {
    renderTableWithData(appState.filteredData);
}

function renderTableWithData(data) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';

    data.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.abreviatura}</td>
            <td>${item.entidad}</td>
            <td>${item.obligacion}</td>
            <td>${item.periodo}</td>
            <td>${formatDate(item.fecha_limite)}</td>
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

function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-ES');
    } catch {
        return dateString;
    }
}

function getStatusClass(status) {
    switch (status?.toLowerCase()) {
        case 'completado': return 'success';
        case 'vencido': return 'error';
        case 'en proceso': return 'warning';
        default: return 'info';
    }
}

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
        date: item.fecha_limite,
        color: getEventColor(item.estado),
        extendedProps: {
            rowIndex: item.rowIndex,
            description: item.obligacion,
            status: item.estado
        }
    }));
}

function getEventColor(status) {
    switch (status?.toLowerCase()) {
        case 'completado': return '#21805C';
        case 'vencido': return '#C0152F';
        case 'en proceso': return '#A84B2F';
        default: return '#626C71';
    }
}

function updateStats() {
    const totalEl = document.getElementById('totalCount');
    const upcomingEl = document.getElementById('upcomingCount');
    const overdueEl = document.getElementById('overdueCount');
    
    if (!totalEl || !upcomingEl || !overdueEl) return;

    const total = appState.filteredData.length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const upcoming = appState.filteredData.filter(item => {
        if (!item.fecha_limite || item.estado === 'Completado') return false;
        const dueDate = new Date(item.fecha_limite);
        const diffTime = dueDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 7;
    }).length;
    
    const overdue = appState.filteredData.filter(item => {
        if (!item.fecha_limite || item.estado === 'Completado') return false;
        const dueDate = new Date(item.fecha_limite);
        return dueDate < today;
    }).length;

    totalEl.textContent = total;
    upcomingEl.textContent = upcoming;
    overdueEl.textContent = overdue;
}

function setupTableFeatures() {
    setupColumnSorting();
    setupColumnResizing();
    setupColumnReordering();
}

function setupColumnSorting() {
    const sortableHeaders = document.querySelectorAll('.sortable');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.classList.contains('resize-handle')) return;
            
            const column = header.dataset.column;
            const currentSort = appState.sortConfig.find(s => s.column === column);
            
            if (e.ctrlKey || e.metaKey) {
                // Multi-column sort
                if (currentSort) {
                    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    appState.sortConfig.push({ column, direction: 'asc' });
                }
            } else {
                // Single column sort
                appState.sortConfig = currentSort && currentSort.direction === 'asc' 
                    ? [{ column, direction: 'desc' }]
                    : [{ column, direction: 'asc' }];
            }
            
            updateSortIndicators();
            sortData();
        });
    });
}

function updateSortIndicators() {
    document.querySelectorAll('.sortable').forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
        const column = header.dataset.column;
        const sort = appState.sortConfig.find(s => s.column === column);
        if (sort) {
            header.classList.add(`sort-${sort.direction}`);
        }
    });
}

function sortData() {
    if (appState.sortConfig.length === 0) return;
    
    appState.filteredData.sort((a, b) => {
        for (const sort of appState.sortConfig) {
            const valueA = a[sort.column] || '';
            const valueB = b[sort.column] || '';
            
            let comparison = 0;
            
            // Special handling for dates
            if (sort.column.includes('fecha')) {
                const dateA = new Date(valueA);
                const dateB = new Date(valueB);
                comparison = dateA - dateB;
            } else {
                comparison = valueA.toString().localeCompare(valueB.toString());
            }
            
            if (comparison !== 0) {
                return sort.direction === 'asc' ? comparison : -comparison;
            }
        }
        return 0;
    });
    
    renderTable();
}

function setupColumnResizing() {
    const resizeHandles = document.querySelectorAll('.resize-handle');
    let isResizing = false;
    let currentHandle = null;
    let startX = 0;
    let startWidth = 0;

    resizeHandles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            currentHandle = handle;
            startX = e.clientX;
            const th = handle.closest('th');
            startWidth = th.offsetWidth;
            e.preventDefault();
        });
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        const th = currentHandle.closest('th');
        const newWidth = startWidth + (e.clientX - startX);
        if (newWidth > 50) { // Minimum width
            th.style.width = newWidth + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        isResizing = false;
        currentHandle = null;
    });
}

function setupColumnReordering() {
    const headerRow = document.getElementById('headerRow');
    if (!headerRow) return;

    let draggedColumn = null;

    headerRow.addEventListener('dragstart', (e) => {
        if (e.target.tagName === 'TH' && !e.target.classList.contains('no-sort')) {
            draggedColumn = e.target;
            e.target.classList.add('dragging');
        }
    });

    headerRow.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    headerRow.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetColumn = e.target.closest('th');
        
        if (draggedColumn && targetColumn && draggedColumn !== targetColumn) {
            const draggedIndex = Array.from(headerRow.children).indexOf(draggedColumn);
            const targetIndex = Array.from(headerRow.children).indexOf(targetColumn);
            
            // Reorder columns in DOM
            if (draggedIndex < targetIndex) {
                targetColumn.parentNode.insertBefore(draggedColumn, targetColumn.nextSibling);
            } else {
                targetColumn.parentNode.insertBefore(draggedColumn, targetColumn);
            }
            
            // Update column order in state
            const draggedColumnKey = draggedColumn.dataset.column;
            const targetColumnKey = targetColumn.dataset.column;
            
            const draggedOrderIndex = appState.columnOrder.indexOf(draggedColumnKey);
            const targetOrderIndex = appState.columnOrder.indexOf(targetColumnKey);
            
            appState.columnOrder.splice(draggedOrderIndex, 1);
            appState.columnOrder.splice(targetOrderIndex, 0, draggedColumnKey);
            
            // Re-render table to match new order
            renderTable();
        }
        
        if (draggedColumn) {
            draggedColumn.classList.remove('dragging');
            draggedColumn = null;
        }
    });

    // Make headers draggable
    document.querySelectorAll('#headerRow th:not(.no-sort)').forEach(th => {
        th.draggable = true;
    });
}

// Make editRecord globally accessible
window.editRecord = function(rowIndex) {
    const record = appState.data.find(item => item.rowIndex === rowIndex);
    if (!record) {
        AlertManager.error('Registro no encontrado');
        return;
    }

    appState.currentEditingRow = rowIndex;
    
    // Populate modal with read-only fields
    const abrevInput = document.getElementById('editAbreviatura');
    const entityInput = document.getElementById('editEntity');
    const obligacionInput = document.getElementById('editObligacion');
    const periodoInput = document.getElementById('editPeriodo');
    const fechaInput = document.getElementById('editFechaLimite');
    const statusInput = document.getElementById('editStatus');
    
    if (abrevInput) abrevInput.value = record.abreviatura || '';
    if (entityInput) entityInput.value = record.entidad || '';
    if (obligacionInput) obligacionInput.value = record.obligacion || '';
    if (periodoInput) periodoInput.value = record.periodo || '';
    if (fechaInput) fechaInput.value = record.fecha_limite || '';
    if (statusInput) statusInput.value = record.estado || 'Pendiente';

    // Show modal
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.classList.remove('hidden');
    }
};

function setupModal() {
    const modal = document.getElementById('editModal');
    const closeBtn = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelEdit');
    const form = document.getElementById('editForm');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeModal);
    }
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    if (form) {
        form.addEventListener('submit', saveRecord);
    }
}

function closeModal() {
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

        const fechaInput = document.getElementById('editFechaLimite');
        const statusInput = document.getElementById('editStatus');

        const updatedData = {
            fecha_limite: fechaInput ? fechaInput.value : '',
            estado: statusInput ? statusInput.value : 'Pendiente'
        };

        // Update local data
        const recordIndex = appState.data.findIndex(item => item.rowIndex === appState.currentEditingRow);
        if (recordIndex !== -1) {
            Object.assign(appState.data[recordIndex], updatedData);
        }

        // Save to Google Sheets if connected
        if (appState.isSignedIn) {
            await safeGoogleSheetsUpdate(appState.currentEditingRow, appState.data[recordIndex]);
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

async function safeGoogleSheetsUpdate(rowIndex, data) {
    try {
        const values = [
            [data.abreviatura, data.entidad, data.obligacion, data.periodo, 
             data.fecha_limite, data.estado, data.empresa, data.responsable,
             data.notas, data.fecha_presentacion, data.monto, data.observaciones]
        ];

        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `Sheet1!A${rowIndex}:L${rowIndex}`,
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

// Make alarmManager available globally for onclick handlers
window.alarmManager = alarmManager;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    
    appState.setLoading(false);
    setupModal();
    alarmManager.init();
    loadDemoData();
    
    // Initialize Google APIs in background
    setTimeout(() => {
        initializeGoogleAPIs();
    }, 500);
});