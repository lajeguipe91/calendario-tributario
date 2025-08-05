// Google Sheets Tax Calendar Dashboard Application
class GoogleSheetsTaxCalendarApp {
    constructor() {
        // Google Sheets Configuration - PRODUCTION CREDENTIALS
        this.SPREADSHEET_ID = '10L6aSKz8oPtq4ZpXcO921vCIciHWlCRqo_w5pAHc3yo';
        this.RANGE = 'Sheet1!A:J';
        this.DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
        this.SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
        
        // PRODUCTION API CREDENTIALS
        this.API_KEY = 'AIzaSyBdlizVp_hOembaoFJYE_rKHCvFtn9asok';
        this.CLIENT_ID = '341125602004-36tl0jfhtd7ce21csjun41fel085res8.apps.googleusercontent.com';
        
        // Application state
        this.calendar = null;
        this.currentRecord = null;
        this.currentAlert = null;
        this.obligations = [];
        this.filteredObligations = [];
        this.sheetsData = [];
        this.isAuthenticated = false;
        this.isInitialized = false;
        this.gapi = null;
        this.tokenClient = null;
        this.authTimeout = null;
        
        this.filters = {
            abbreviations: [],
            entities: [],
            responsables: [],
            estados: []
        };
        
        this.alerts = [
            {
                id: 1,
                name: "Retenciones DIAN - Alerta General",
                entity: "DIAN", 
                obligation: "RETENCIÓN",
                days_before: 5,
                recipients: ["hzurita@ifc-sas.com", "mgonzalez@ifc-sas.com"],
                active: true
            },
            {
                id: 2,
                name: "IVA Bimestral - Todas las empresas",
                entity: "DIAN",
                obligation: "IVA", 
                days_before: 7,
                recipients: ["hzurita@ifc-sas.com"],
                active: true
            }
        ];
        
        // Color mapping for obligation types
        this.obligationColors = {
            "RENTA": "#1FB8CD",
            "RETENCIÓN": "#FFC185", 
            "IVA": "#B4413C",
            "ICA": "#ECEBD5",
            "ReteICA": "#5D878F",
            "Informe 75 (SAGRILAFT, RMM y PTEE)": "#DB4545",
            "Retención": "#D2BA4C",
            "Renta": "#964325"
        };

        // Wait for DOM to be fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    async initialize() {
        console.log('Initializing Google Sheets Tax Calendar App with production credentials');
        
        this.showLoadingOverlay('Inicializando aplicación...');
        
        try {
            // Initialize Google APIs with real credentials
            await this.initializeGoogleApis();
            
            // Load initial demo data for immediate display
            this.loadFallbackData();
            
            // Initialize UI components
            this.initializeMultiSelects();
            this.initializeCalendar();
            this.initializeEventListeners();
            
            // Check authentication status
            this.checkAuthStatus();
            
            this.hideLoadingOverlay();
            this.isInitialized = true;
            
            console.log('Application initialized successfully with production API credentials');
            
        } catch (error) {
            console.error('Error initializing application:', error);
            this.hideLoadingOverlay();
            this.showNotification('Error al inicializar la aplicación: ' + error.message, 'error');
            
            // Load fallback data even if API initialization fails
            this.loadFallbackData();
            this.initializeMultiSelects();
            this.initializeCalendar();
            this.initializeEventListeners();
            this.checkAuthStatus();
        }
    }

    async initializeGoogleApis() {
        return new Promise((resolve, reject) => {
            // Check if Google APIs are available
            if (typeof gapi === 'undefined') {
                console.warn('Google APIs not available, using demo mode');
                resolve();
                return;
            }

            try {
                gapi.load('client', async () => {
                    try {
                        await gapi.client.init({
                            apiKey: this.API_KEY,
                            discoveryDocs: [this.DISCOVERY_DOC],
                        });
                        
                        this.gapi = gapi;
                        
                        // Initialize Google Identity Services if available
                        if (typeof google !== 'undefined' && google.accounts) {
                            this.tokenClient = google.accounts.oauth2.initTokenClient({
                                client_id: this.CLIENT_ID,
                                scope: this.SCOPES,
                                callback: (tokenResponse) => {
                                    console.log('Authentication successful:', tokenResponse);
                                    this.handleAuthSuccess(tokenResponse);
                                },
                                error_callback: (error) => {
                                    console.error('Authentication error:', error);
                                    this.handleAuthError(error);
                                }
                            });
                        }
                        
                        console.log('Google APIs initialized successfully');
                        resolve();
                        
                    } catch (error) {
                        console.warn('Google API initialization failed:', error);
                        resolve(); // Continue with demo mode
                    }
                });
            } catch (error) {
                console.warn('Google API load failed:', error);
                resolve(); // Continue with demo mode
            }
        });
    }

    checkAuthStatus() {
        // Check if user is already authenticated
        if (this.gapi && this.gapi.client.getToken && this.gapi.client.getToken()) {
            this.isAuthenticated = true;
            this.updateConnectionStatus('online');
            this.hideAuthBanner();
            this.loadDataFromSheets();
        } else {
            this.isAuthenticated = false;
            this.updateConnectionStatus('offline');
            this.showAuthBanner();
        }
    }

    showAuthBanner() {
        const banner = document.getElementById('auth-banner');
        if (banner) {
            banner.classList.remove('hidden');
        }
    }

    hideAuthBanner() {
        const banner = document.getElementById('auth-banner');
        if (banner) {
            banner.classList.add('hidden');
        }
    }

    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connection-status');
        const indicator = statusElement?.querySelector('.status-indicator');
        const text = statusElement?.querySelector('span');
        
        if (!indicator || !text) return;
        
        indicator.className = `status-indicator ${status}`;
        
        switch (status) {
            case 'online':
                text.textContent = 'Conectado a Google Sheets';
                break;
            case 'connecting':
                text.textContent = 'Conectando...';
                break;
            case 'offline':
            default:
                text.textContent = 'Desconectado';
                break;
        }
    }

    async authenticateUser() {
        // Clear any existing timeout
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
        }

        if (!this.tokenClient) {
            this.showNotification('APIs de Google no disponibles. Usando modo demostración.', 'warning');
            return;
        }

        this.updateConnectionStatus('connecting');
        this.showLoadingOverlay('Autenticando con Google...');
        
        // Set a timeout for authentication
        this.authTimeout = setTimeout(() => {
            this.handleAuthError(new Error('Tiempo de espera agotado'));
        }, 10000); // 10 second timeout

        try {
            // Request access token
            this.tokenClient.requestAccessToken({prompt: 'consent'});
            
        } catch (error) {
            console.error('Authentication error:', error);
            this.handleAuthError(error);
        }
    }

    handleAuthSuccess(tokenResponse) {
        // Clear timeout
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }

        console.log('Authentication successful, loading data from Google Sheets');
        this.isAuthenticated = true;
        this.updateConnectionStatus('online');
        this.hideAuthBanner();
        this.loadDataFromSheets();
        this.hideLoadingOverlay();
        this.showNotification('Autenticación exitosa. Cargando datos desde Google Sheets.', 'success');
    }

    handleAuthError(error) {
        // Clear timeout
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }

        console.error('Authentication failed:', error);
        this.updateConnectionStatus('offline');
        this.hideLoadingOverlay();
        
        const errorMessage = error.message || 'Error desconocido en la autenticación';
        this.showNotification(`Error en la autenticación: ${errorMessage}. Usando datos de demostración.`, 'error');
    }

    async loadDataFromSheets() {
        if (!this.isAuthenticated || !this.gapi) {
            console.warn('Not authenticated or GAPI not available, cannot load data from sheets');
            return;
        }

        this.showLoadingOverlay('Cargando datos desde Google Sheets...');
        
        try {
            const response = await this.gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: this.SPREADSHEET_ID,
                range: this.RANGE,
            });

            const rows = response.result.values;
            if (!rows || rows.length <= 1) {
                throw new Error('No se encontraron datos en la hoja de cálculo');
            }

            // Skip header row and transform data
            const dataRows = rows.slice(1);
            this.obligations = dataRows.map((row, index) => ({
                id: index + 1,
                empresa: row[0] || 'Empresa no especificada',
                abreviatura: row[1] || 'N/A',
                responsable: row[2] || 'No asignado',
                entidad: row[3] || 'Sin entidad',
                obligacion: row[4] || 'Sin obligación',
                periodo: row[5] || '',
                ano: parseInt(row[6]) || 2024,
                fecha_limite: this.formatDate(row[7]),
                estado: row[8] || 'Pendiente',
                correo: row[9] || ''
            }));

            // Extract unique values for filters
            this.extractFilterOptions();
            
            // Update UI
            this.filteredObligations = [...this.obligations];
            this.populateFilterOptions();
            this.updateCalendar();
            this.updateSummaryCards();
            
            console.log(`Cargados ${this.obligations.length} registros desde Google Sheets`);
            this.showNotification(`Datos cargados exitosamente: ${this.obligations.length} obligaciones`, 'success');
            
        } catch (error) {
            console.error('Error loading data from sheets:', error);
            this.showNotification('Error al cargar datos desde Google Sheets: ' + error.message, 'error');
            
            // Keep using fallback data if already loaded
            if (this.obligations.length === 0) {
                this.loadFallbackData();
            }
        } finally {
            this.hideLoadingOverlay();
        }
    }

    formatDate(dateString) {
        if (!dateString) return new Date().toISOString().split('T')[0];
        
        // Handle various date formats
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            // Try different parsing approaches
            const parts = dateString.split('/');
            if (parts.length === 3) {
                // Assume MM/DD/YYYY or DD/MM/YYYY format
                const testDate = new Date(parts[2], parts[0] - 1, parts[1]);
                if (!isNaN(testDate.getTime())) {
                    return testDate.toISOString().split('T')[0];
                }
            }
            // Default to today if parsing fails
            return new Date().toISOString().split('T')[0];
        }
        
        return date.toISOString().split('T')[0];
    }

    extractFilterOptions() {
        const abbreviations = new Set();
        const entities = new Set();
        const responsables = new Set();
        const estados = new Set();

        this.obligations.forEach(obligation => {
            if (obligation.abreviatura && obligation.abreviatura !== 'N/A') abbreviations.add(obligation.abreviatura);
            if (obligation.entidad && obligation.entidad !== 'Sin entidad') entities.add(obligation.entidad);
            if (obligation.responsable && obligation.responsable !== 'No asignado') responsables.add(obligation.responsable);
            if (obligation.estado) estados.add(obligation.estado);
        });

        this.filterOptions = {
            abbreviations: Array.from(abbreviations).sort(),
            entities: Array.from(entities).sort(),
            responsables: Array.from(responsables).sort(),
            estados: Array.from(estados).sort()
        };
    }

    loadFallbackData() {
        // Load demo data when not connected to Google Sheets
        this.obligations = [
            {"id": 1, "empresa": "TRANSITO Y MOBILIARIO URBANO S.A.S SOCIEDAD DE ECONOMIA MIXTA - SEM PT", "abreviatura": "SEM PT", "responsable": "Heidy Zurita", "entidad": "DIAN", "obligacion": "RENTA", "periodo": "12", "ano": 2024, "fecha_limite": "2025-05-23", "estado": "Pendiente", "correo": "hzurita@ifc-sas.com"},
            {"id": 2, "empresa": "TRANSITO Y MOBILIARIO URBANO S.A.S SOCIEDAD DE ECONOMIA MIXTA - SEM PT", "abreviatura": "SEM PT", "responsable": "Heidy Zurita", "entidad": "DIAN", "obligacion": "RETENCIÓN", "periodo": "1", "ano": 2025, "fecha_limite": "2025-02-24", "estado": "Pendiente", "correo": "hzurita@ifc-sas.com"},
            {"id": 3, "empresa": "TRANSITO Y MOBILIARIO URBANO S.A.S SOCIEDAD DE ECONOMIA MIXTA - SEM PT", "abreviatura": "SEM PT", "responsable": "Heidy Zurita", "entidad": "DIAN", "obligacion": "RETENCIÓN", "periodo": "2", "ano": 2025, "fecha_limite": "2025-03-25", "estado": "Pendiente", "correo": "hzurita@ifc-sas.com"},
            {"id": 4, "empresa": "TRANSITO Y MOBILIARIO URBANO S.A.S SOCIEDAD DE ECONOMIA MIXTA - SEM PT", "abreviatura": "SEM PT", "responsable": "Heidy Zurita", "entidad": "DIAN", "obligacion": "RETENCIÓN", "periodo": "3", "ano": 2025, "fecha_limite": "2025-04-24", "estado": "Pendiente", "correo": "hzurita@ifc-sas.com"},
            {"id": 5, "empresa": "ARCHIVOS & PROCESOS SAS", "abreviatura": "ARPRO", "responsable": "Heidy Zurita", "entidad": "DIAN", "obligacion": "RENTA", "periodo": "12", "ano": 2024, "fecha_limite": "2025-05-23", "estado": "Presentado", "correo": "hzurita@ifc-sas.com"},
            {"id": 6, "empresa": "ARCHIVOS & PROCESOS SAS", "abreviatura": "ARPRO", "responsable": "María González", "entidad": "DIAN", "obligacion": "IVA", "periodo": "ene-feb", "ano": 2025, "fecha_limite": "2025-03-14", "estado": "Pendiente", "correo": "mgonzalez@ifc-sas.com"},
            {"id": 7, "empresa": "ARCHIVOS & PROCESOS SAS", "abreviatura": "ARPRO", "responsable": "Heidy Zurita", "entidad": "Bogotá D.C.", "obligacion": "ICA", "periodo": "Ene-Feb", "ano": 2025, "fecha_limite": "2025-04-04", "estado": "Pendiente", "correo": "hzurita@ifc-sas.com"},
            {"id": 8, "empresa": "ARCHIVOS & PROCESOS SAS", "abreviatura": "ARPRO", "responsable": "Heidy Zurita", "entidad": "Bogotá D.C.", "obligacion": "ReteICA", "periodo": "Ene-Feb", "ano": 2025, "fecha_limite": "2025-03-21", "estado": "Pendiente", "correo": "hzurita@ifc-sas.com"},
            {"id": 9, "empresa": "ARCHIVOS & PROCESOS SAS", "abreviatura": "ARPRO", "responsable": "Carlos Ramírez", "entidad": "Barranquilla", "obligacion": "ICA", "periodo": "Anual", "ano": 2024, "fecha_limite": "2025-02-20", "estado": "No aplica", "correo": "cramirez@ifc-sas.com"},
            {"id": 10, "empresa": "ARCHIVOS & PROCESOS SAS", "abreviatura": "ARPRO", "responsable": "Heidy Zurita", "entidad": "Superintendencia de Sociedades", "obligacion": "Informe 75 (SAGRILAFT, RMM y PTEE)", "periodo": "", "ano": 2025, "fecha_limite": "2025-05-30", "estado": "Pendiente", "correo": "hzurita@ifc-sas.com"},
            {"id": 11, "empresa": "INTERNACIONAL DE PROYECTOS IP SA", "abreviatura": "IP", "responsable": "Ana López", "entidad": "DIAN", "obligacion": "Retención", "periodo": "1", "ano": 2025, "fecha_limite": "2025-02-24", "estado": "Presentado", "correo": "alopez@ifc-sas.com"},
            {"id": 12, "empresa": "INTERNACIONAL DE PROYECTOS IP SA", "abreviatura": "IP", "responsable": "Heidy Zurita", "entidad": "DIAN", "obligacion": "IVA", "periodo": "ene-feb", "ano": 2025, "fecha_limite": "2025-03-14", "estado": "Pendiente", "correo": "hzurita@ifc-sas.com"},
            {"id": 13, "empresa": "INTERNACIONAL DE PROYECTOS IP SA", "abreviatura": "IP", "responsable": "Heidy Zurita", "entidad": "Bogotá D.C.", "obligacion": "ICA", "periodo": "ene-feb", "ano": 2025, "fecha_limite": "2025-04-04", "estado": "Pendiente", "correo": "hzurita@ifc-sas.com"},
            {"id": 14, "empresa": "INTERNACIONAL DE PROYECTOS IP SA", "abreviatura": "IP", "responsable": "Heidy Zurita", "entidad": "DIAN", "obligacion": "Renta", "periodo": "12", "ano": 2024, "fecha_limite": "2025-05-23", "estado": "Pendiente", "correo": "hzurita@ifc-sas.com"},
            {"id": 15, "empresa": "INVERSIONES FACTURAS Y CARTERAS SAS", "abreviatura": "IFC", "responsable": "María González", "entidad": "DIAN", "obligacion": "RETENCIÓN", "periodo": "1", "ano": 2025, "fecha_limite": "2025-02-24", "estado": "Pendiente", "correo": "mgonzalez@ifc-sas.com"},
            {"id": 16, "empresa": "INVERSIONES FACTURAS Y CARTERAS SAS", "abreviatura": "IFC", "responsable": "Heidy Zurita", "entidad": "DIAN", "obligacion": "RENTA", "periodo": "12", "ano": 2024, "fecha_limite": "2025-05-23", "estado": "Pendiente", "correo": "hzurita@ifc-sas.com"},
            {"id": 17, "empresa": "INVERSIONES FACTURAS Y CARTERAS SAS", "abreviatura": "IFC", "responsable": "Heidy Zurita", "entidad": "DIAN", "obligacion": "IVA", "periodo": "ene-feb", "ano": 2025, "fecha_limite": "2025-03-14", "estado": "Pendiente", "correo": "hzurita@ifc-sas.com"},
            {"id": 18, "empresa": "INVERSIONES FACTURAS Y CARTERAS SAS", "abreviatura": "IFC", "responsable": "Carlos Ramírez", "entidad": "Bogotá D.C.", "obligacion": "ICA", "periodo": "ene-feb", "ano": 2025, "fecha_limite": "2025-04-04", "estado": "No aplica", "correo": "cramirez@ifc-sas.com"}
        ];

        this.extractFilterOptions();
        this.filteredObligations = [...this.obligations];
        this.populateFilterOptions();
        this.updateCalendar();
        this.updateSummaryCards();
        
        console.log('Loaded fallback demo data');
    }

    async updateRecordInSheets(obligation) {
        if (!this.isAuthenticated || !this.gapi) {
            this.showNotification('Para guardar cambios en Google Sheets debe autenticarse primero', 'warning');
            return true; // Allow local changes even without authentication
        }

        try {
            this.showLoadingOverlay('Guardando cambios en Google Sheets...');
            
            // Find the row index (adding 2 to account for header row and 0-based indexing)
            const rowIndex = this.obligations.findIndex(o => o.id === obligation.id) + 2;
            
            if (rowIndex < 2) {
                throw new Error('No se pudo encontrar el registro en la hoja de cálculo');
            }

            // Prepare the update data
            const values = [
                [
                    obligation.empresa,
                    obligation.abreviatura,
                    obligation.responsable,
                    obligation.entidad,
                    obligation.obligacion,
                    obligation.periodo,
                    obligation.ano.toString(),
                    obligation.fecha_limite,
                    obligation.estado,
                    obligation.correo
                ]
            ];

            // Update the specific row in Google Sheets
            const response = await this.gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: this.SPREADSHEET_ID,
                range: `Sheet1!A${rowIndex}:J${rowIndex}`,
                valueInputOption: 'RAW',
                resource: {
                    values: values
                }
            });

            console.log('Google Sheets update response:', response);
            this.showNotification('Cambios guardados en Google Sheets exitosamente', 'success');
            return true;
            
        } catch (error) {
            console.error('Error updating record in sheets:', error);
            this.showNotification('Error al guardar cambios en Google Sheets: ' + error.message, 'error');
            return false;
        } finally {
            this.hideLoadingOverlay();
        }
    }

    async syncDataFromSheets() {
        if (!this.isAuthenticated) {
            await this.authenticateUser();
            return;
        }

        await this.loadDataFromSheets();
    }

    showLoadingOverlay(message = 'Cargando...') {
        const overlay = document.getElementById('loading-overlay');
        const messageElement = overlay?.querySelector('p');
        
        if (overlay) {
            overlay.classList.remove('hidden');
            if (messageElement) {
                messageElement.textContent = message;
            }

            // Add click handler to close overlay if it's been showing for too long
            setTimeout(() => {
                if (!overlay.classList.contains('hidden')) {
                    overlay.addEventListener('click', () => {
                        this.hideLoadingOverlay();
                        if (this.authTimeout) {
                            clearTimeout(this.authTimeout);
                            this.authTimeout = null;
                        }
                        this.updateConnectionStatus('offline');
                    }, { once: true });
                }
            }, 5000);
        }
    }

    hideLoadingOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }

    initializeMultiSelects() {
        const filterConfigs = [
            { id: 'company-filter', type: 'abbreviations' },
            { id: 'entity-filter', type: 'entities' },
            { id: 'responsible-filter', type: 'responsables' },
            { id: 'status-filter', type: 'estados' }
        ];

        filterConfigs.forEach(config => {
            this.setupMultiSelect(config.id, config.type);
        });
    }

    setupMultiSelect(filterId, filterType) {
        const container = document.getElementById(filterId);
        if (!container) return;

        const display = container.querySelector('.multi-select-display');
        const options = container.querySelector('.multi-select-options');
        const optionsList = container.querySelector('.options-list');
        const searchInput = container.querySelector('.search-input');

        optionsList.dataset.filter = filterType;

        // Toggle dropdown
        display.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown(container, options, display);
        });

        // Search functionality
        searchInput.addEventListener('input', (e) => {
            this.filterOptionsInDropdown(optionsList, filterType, e.target.value);
        });

        // Option selection
        optionsList.addEventListener('click', (e) => {
            const optionItem = e.target.closest('.option-item');
            if (optionItem) {
                this.toggleOption(optionItem, filterType, display);
                this.applyFilters();
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                options.classList.add('hidden');
                display.classList.remove('active');
            }
        });
    }

    populateFilterOptions() {
        document.querySelectorAll('.options-list').forEach(optionsList => {
            const filterType = optionsList.dataset.filter;
            this.populateOptions(optionsList, filterType);
        });
    }

    populateOptions(optionsList, filterType) {
        const options = this.filterOptions?.[filterType] || [];
        optionsList.innerHTML = '';

        options.forEach(option => {
            const optionItem = document.createElement('div');
            optionItem.className = 'option-item';
            optionItem.dataset.value = option;
            
            const isSelected = this.filters[filterType].includes(option);
            if (isSelected) {
                optionItem.classList.add('selected');
            }
            
            optionItem.innerHTML = `
                <div class="option-checkbox ${isSelected ? 'checked' : ''}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: ${isSelected ? 'block' : 'none'};">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
                <span class="option-text">${option}</span>
            `;

            optionsList.appendChild(optionItem);
        });
    }

    toggleDropdown(container, options, display) {
        const isHidden = options.classList.contains('hidden');
        
        // Close all other dropdowns
        document.querySelectorAll('.multi-select-options').forEach(opt => {
            opt.classList.add('hidden');
        });
        document.querySelectorAll('.multi-select-display').forEach(disp => {
            disp.classList.remove('active');
        });

        if (isHidden) {
            options.classList.remove('hidden');
            display.classList.add('active');
            const searchInput = container.querySelector('.search-input');
            if (searchInput) {
                searchInput.focus();
                searchInput.value = '';
            }
            const optionsList = container.querySelector('.options-list');
            const filterType = optionsList.dataset.filter;
            this.populateOptions(optionsList, filterType);
        }
    }

    filterOptionsInDropdown(optionsList, filterType, searchTerm) {
        const options = this.filterOptions?.[filterType] || [];
        optionsList.innerHTML = '';

        const filteredOptions = options.filter(option => 
            option.toLowerCase().includes(searchTerm.toLowerCase())
        );

        filteredOptions.forEach(option => {
            const optionItem = document.createElement('div');
            optionItem.className = 'option-item';
            optionItem.dataset.value = option;
            
            const isSelected = this.filters[filterType].includes(option);
            if (isSelected) {
                optionItem.classList.add('selected');
            }
            
            optionItem.innerHTML = `
                <div class="option-checkbox ${isSelected ? 'checked' : ''}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: ${isSelected ? 'block' : 'none'};">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
                <span class="option-text">${option}</span>
            `;

            optionsList.appendChild(optionItem);
        });
    }

    toggleOption(optionItem, filterType, display) {
        const value = optionItem.dataset.value;
        const checkbox = optionItem.querySelector('.option-checkbox');
        const checkIcon = optionItem.querySelector('svg');
        
        const isSelected = this.filters[filterType].includes(value);
        
        if (isSelected) {
            this.filters[filterType] = this.filters[filterType].filter(item => item !== value);
            optionItem.classList.remove('selected');
            checkbox.classList.remove('checked');
            checkIcon.style.display = 'none';
        } else {
            this.filters[filterType].push(value);
            optionItem.classList.add('selected');
            checkbox.classList.add('checked');
            checkIcon.style.display = 'block';
        }

        this.updateDisplayText(display, filterType);
    }

    updateDisplayText(display, filterType) {
        const selectedItems = this.filters[filterType];
        const placeholder = display.querySelector('.placeholder');
        
        if (selectedItems.length === 0) {
            const labels = {
                abbreviations: 'Seleccionar empresas...',
                entities: 'Seleccionar entidades...',
                responsables: 'Seleccionar responsables...',
                estados: 'Seleccionar estados...'
            };
            placeholder.textContent = labels[filterType];
            placeholder.style.display = 'block';
        } else {
            const tags = selectedItems.map(item => `
                <span class="selected-tag">
                    ${item}
                    <button class="tag-remove" data-value="${item}" data-type="${filterType}">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </span>
            `).join('');
            
            placeholder.innerHTML = `<div class="selected-tags">${tags}</div>`;
            placeholder.style.display = 'block';
            
            placeholder.querySelectorAll('.tag-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const value = btn.dataset.value;
                    const type = btn.dataset.type;
                    this.removeSelection(value, type, display);
                });
            });
        }
    }

    removeSelection(value, filterType, display) {
        this.filters[filterType] = this.filters[filterType].filter(item => item !== value);
        this.updateDisplayText(display, filterType);
        this.applyFilters();
        
        const container = display.closest('.multi-select-dropdown');
        const optionItem = container.querySelector(`[data-value="${value}"]`);
        if (optionItem) {
            optionItem.classList.remove('selected');
            const checkbox = optionItem.querySelector('.option-checkbox');
            const checkIcon = optionItem.querySelector('svg');
            checkbox.classList.remove('checked');
            checkIcon.style.display = 'none';
        }
    }

    initializeCalendar() {
        const calendarEl = document.getElementById('calendar');
        if (!calendarEl) {
            console.error('Calendar element not found');
            return;
        }
        
        this.calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            locale: 'es',
            height: 'auto',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,listWeek,dayGridWeek'
            },
            buttonText: {
                today: 'Hoy',
                month: 'Mes',
                week: 'Semana',
                list: 'Lista'
            },
            events: () => this.getCalendarEvents(),
            eventClick: (info) => {
                info.jsEvent.preventDefault();
                const obligationId = parseInt(info.event.id);
                const obligation = this.obligations.find(o => o.id === obligationId);
                if (obligation) {
                    this.showEditModal(obligation);
                }
            },
            eventDidMount: (info) => {
                const obligationId = parseInt(info.event.id);
                const obligation = this.obligations.find(o => o.id === obligationId);
                if (obligation) {
                    info.el.title = `${obligation.empresa} - ${obligation.obligacion}\nResponsable: ${obligation.responsable}\nEstado: ${obligation.estado}`;
                }
            },
            dayMaxEvents: 3,
            moreLinkClick: 'listWeek'
        });

        try {
            this.calendar.render();
            console.log('Calendar rendered successfully');
        } catch (error) {
            console.error('Error rendering calendar:', error);
        }
    }

    getCalendarEvents() {
        return this.filteredObligations.map(obligation => {
            const event = {
                id: obligation.id.toString(),
                title: `${obligation.abreviatura} - ${obligation.obligacion}`,
                start: obligation.fecha_limite,
                backgroundColor: this.obligationColors[obligation.obligacion] || '#95a5a6',
                borderColor: this.obligationColors[obligation.obligacion] || '#95a5a6',
                textColor: '#ffffff',
                extendedProps: {
                    obligation: obligation
                }
            };
            
            if (obligation.estado === 'Presentado' || obligation.estado === 'No aplica') {
                event.backgroundColor = event.backgroundColor + '80';
                event.borderColor = event.borderColor + '80';
            }
            
            return event;
        });
    }

    updateCalendar() {
        if (this.calendar) {
            this.calendar.removeAllEvents();
            this.calendar.addEventSource(() => this.getCalendarEvents());
        }
    }

    initializeEventListeners() {
        // Authentication button
        const authBtn = document.getElementById('auth-btn');
        if (authBtn) {
            authBtn.addEventListener('click', () => this.authenticateUser());
        }

        // Clear filters button
        const clearFiltersBtn = document.getElementById('clear-filters');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => this.clearAllFilters());
        }

        // Sync button
        const syncBtn = document.getElementById('sync-btn');
        if (syncBtn) {
            syncBtn.addEventListener('click', () => this.syncDataFromSheets());
        }

        // Alerts management button
        const alertsBtn = document.getElementById('alerts-btn');
        if (alertsBtn) {
            alertsBtn.addEventListener('click', () => this.showAlertsModal());
        }

        this.setupEditModalListeners();
        this.setupAlertModalListeners();
    }

    setupEditModalListeners() {
        const modal = document.getElementById('edit-modal');
        if (!modal) return;
        
        const closeBtn = modal.querySelector('.modal-close');
        const overlay = modal.querySelector('.modal-overlay');
        const cancelBtn = document.getElementById('edit-cancel');
        const saveBtn = document.getElementById('edit-save');

        [closeBtn, overlay, cancelBtn].forEach(element => {
            if (element) {
                element.addEventListener('click', () => this.hideEditModal());
            }
        });

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveRecord());
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
                this.hideEditModal();
            }
        });
    }

    setupAlertModalListeners() {
        const alertsModal = document.getElementById('alerts-modal');
        const alertFormModal = document.getElementById('alert-form-modal');
        
        if (alertsModal) {
            const alertsCloseBtn = alertsModal.querySelector('.modal-close');
            const alertsOverlay = alertsModal.querySelector('.modal-overlay');
            
            [alertsCloseBtn, alertsOverlay].forEach(element => {
                if (element) {
                    element.addEventListener('click', () => this.hideAlertsModal());
                }
            });
        }

        const addAlertBtn = document.getElementById('add-alert');
        if (addAlertBtn) {
            addAlertBtn.addEventListener('click', () => this.showAlertFormModal());
        }

        if (alertFormModal) {
            const formCloseBtn = alertFormModal.querySelector('.modal-close');
            const formOverlay = alertFormModal.querySelector('.modal-overlay');
            const formCancelBtn = document.getElementById('alert-form-cancel');
            const formSaveBtn = document.getElementById('alert-form-save');

            [formCloseBtn, formOverlay, formCancelBtn].forEach(element => {
                if (element) {
                    element.addEventListener('click', () => this.hideAlertFormModal());
                }
            });

            if (formSaveBtn) {
                formSaveBtn.addEventListener('click', () => this.saveAlert());
            }
        }
    }

    applyFilters() {
        this.filteredObligations = this.obligations.filter(obligation => {
            const matchesCompany = this.filters.abbreviations.length === 0 || 
                                 this.filters.abbreviations.includes(obligation.abreviatura);
            
            const matchesEntity = this.filters.entities.length === 0 || 
                                this.filters.entities.includes(obligation.entidad);
            
            const matchesResponsible = this.filters.responsables.length === 0 || 
                                     this.filters.responsables.includes(obligation.responsable);
            
            const matchesStatus = this.filters.estados.length === 0 || 
                                this.filters.estados.includes(obligation.estado);

            return matchesCompany && matchesEntity && matchesResponsible && matchesStatus;
        });

        this.updateCalendar();
        this.updateSummaryCards();
    }

    clearAllFilters() {
        Object.keys(this.filters).forEach(key => {
            this.filters[key] = [];
        });

        document.querySelectorAll('.multi-select-display .placeholder').forEach(placeholder => {
            const display = placeholder.closest('.multi-select-display');
            const container = display.closest('.multi-select-dropdown');
            const optionsList = container.querySelector('.options-list');
            const filterType = optionsList.dataset.filter;
            
            const labels = {
                abbreviations: 'Seleccionar empresas...',
                entities: 'Seleccionar entidades...',
                responsables: 'Seleccionar responsables...',
                estados: 'Seleccionar estados...'
            };
            
            placeholder.textContent = labels[filterType];
            placeholder.innerHTML = labels[filterType];
        });

        document.querySelectorAll('.option-item').forEach(item => {
            item.classList.remove('selected');
            const checkbox = item.querySelector('.option-checkbox');
            const checkIcon = item.querySelector('svg');
            if (checkbox) checkbox.classList.remove('checked');
            if (checkIcon) checkIcon.style.display = 'none';
        });

        this.applyFilters();
        this.showNotification('Filtros limpiados', 'info');
    }

    showEditModal(obligation) {
        this.currentRecord = obligation;
        
        const elements = {
            'edit-company': obligation.empresa,
            'edit-entity': obligation.entidad,
            'edit-obligation': obligation.obligacion,
            'edit-responsible': obligation.responsable,
            'edit-due-date': obligation.fecha_limite,
            'edit-status': obligation.estado
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.value = value;
            }
        });

        const modal = document.getElementById('edit-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideEditModal() {
        const modal = document.getElementById('edit-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        this.currentRecord = null;
    }

    async saveRecord() {
        if (!this.currentRecord) return;

        const newDueDate = document.getElementById('edit-due-date').value;
        const newStatus = document.getElementById('edit-status').value;

        // Update local data
        this.currentRecord.fecha_limite = newDueDate;
        this.currentRecord.estado = newStatus;

        const filteredRecord = this.filteredObligations.find(o => o.id === this.currentRecord.id);
        if (filteredRecord) {
            filteredRecord.fecha_limite = newDueDate;
            filteredRecord.estado = newStatus;
        }

        // Save to Google Sheets
        const success = await this.updateRecordInSheets(this.currentRecord);
        
        if (success) {
            this.updateCalendar();
            this.updateSummaryCards();
            this.hideEditModal();
        }
    }

    showAlertsModal() {
        this.renderAlertsList();
        const modal = document.getElementById('alerts-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideAlertsModal() {
        const modal = document.getElementById('alerts-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    renderAlertsList() {
        const alertsList = document.getElementById('alerts-list');
        if (!alertsList) return;

        if (this.alerts.length === 0) {
            alertsList.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">No hay alertas configuradas</p>';
            return;
        }

        alertsList.innerHTML = this.alerts.map(alert => `
            <div class="alert-item">
                <div class="alert-info">
                    <div class="alert-status ${alert.active ? 'active' : 'inactive'}">
                        ${alert.active ? 'Activa' : 'Inactiva'}
                    </div>
                    <div class="alert-name">${alert.name}</div>
                    <div class="alert-details">
                        ${alert.entity ? `Entidad: ${alert.entity}` : 'Todas las entidades'} • 
                        ${alert.obligation ? `Obligación: ${alert.obligation}` : 'Todas las obligaciones'} • 
                        ${alert.days_before} días antes
                    </div>
                    <div class="alert-recipients">
                        Destinatarios: ${alert.recipients.join(', ')}
                    </div>
                </div>
                <div class="alert-actions">
                    <button class="btn btn--sm btn--secondary" onclick="window.taxCalendarApp.editAlert(${alert.id})">
                        Editar
                    </button>
                    <button class="btn btn--sm btn--outline" onclick="window.taxCalendarApp.deleteAlert(${alert.id})">
                        Eliminar
                    </button>
                </div>
            </div>
        `).join('');
    }

    showAlertFormModal(alert = null) {
        this.currentAlert = alert;
        
        if (alert) {
            document.getElementById('alert-form-title').textContent = 'Editar Alerta';
            document.getElementById('alert-name').value = alert.name;
            document.getElementById('alert-entity').value = alert.entity || '';
            document.getElementById('alert-obligation').value = alert.obligation || '';
            document.getElementById('alert-days').value = alert.days_before;
            document.getElementById('alert-recipients').value = alert.recipients.join(', ');
            document.getElementById('alert-active').checked = alert.active;
        } else {
            document.getElementById('alert-form-title').textContent = 'Nueva Alerta';
            document.getElementById('alert-name').value = '';
            document.getElementById('alert-entity').value = '';
            document.getElementById('alert-obligation').value = '';
            document.getElementById('alert-days').value = '7';
            document.getElementById('alert-recipients').value = 'hzurita@ifc-sas.com';
            document.getElementById('alert-active').checked = true;
        }

        // Populate entity and obligation options
        this.populateAlertOptions();

        document.getElementById('alert-form-modal').classList.remove('hidden');
    }

    hideAlertFormModal() {
        document.getElementById('alert-form-modal').classList.add('hidden');
        this.currentAlert = null;
    }

    saveAlert() {
        const name = document.getElementById('alert-name').value.trim();
        const entity = document.getElementById('alert-entity').value;
        const obligation = document.getElementById('alert-obligation').value;
        const days = parseInt(document.getElementById('alert-days').value);
        const recipients = document.getElementById('alert-recipients').value
            .split(',')
            .map(email => email.trim())
            .filter(email => email);
        const active = document.getElementById('alert-active').checked;

        if (!name) {
            this.showNotification('El nombre de la alerta es requerido', 'error');
            return;
        }

        if (recipients.length === 0) {
            this.showNotification('Debe especificar al menos un destinatario', 'error');
            return;
        }

        if (this.currentAlert) {
            this.currentAlert.name = name;
            this.currentAlert.entity = entity;
            this.currentAlert.obligation = obligation;
            this.currentAlert.days_before = days;
            this.currentAlert.recipients = recipients;
            this.currentAlert.active = active;
        } else {
            const newAlert = {
                id: Date.now(),
                name,
                entity,
                obligation,
                days_before: days,
                recipients,
                active
            };
            this.alerts.push(newAlert);
        }

        this.hideAlertFormModal();
        this.renderAlertsList();
        this.showNotification('Alerta guardada correctamente', 'success');
    }

    editAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            this.showAlertFormModal(alert);
        }
    }

    deleteAlert(alertId) {
        if (confirm('¿Está seguro de eliminar esta alerta?')) {
            this.alerts = this.alerts.filter(a => a.id !== alertId);
            this.renderAlertsList();
            this.showNotification('Alerta eliminada', 'info');
        }
    }

    populateAlertOptions() {
        const entitySelect = document.getElementById('alert-entity');
        const obligationSelect = document.getElementById('alert-obligation');

        if (entitySelect && this.filterOptions?.entities) {
            entitySelect.innerHTML = '<option value="">Todas las entidades</option>';
            this.filterOptions.entities.forEach(entity => {
                const option = document.createElement('option');
                option.value = entity;
                option.textContent = entity;
                entitySelect.appendChild(option);
            });
        }

        if (obligationSelect && this.obligations.length > 0) {
            obligationSelect.innerHTML = '<option value="">Todas las obligaciones</option>';
            const obligations = [...new Set(this.obligations.map(o => o.obligacion))];
            obligations.forEach(obligation => {
                const option = document.createElement('option');
                option.value = obligation;
                option.textContent = obligation;
                obligationSelect.appendChild(option);
            });
        }
    }

    updateSummaryCards() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);

        const stats = this.filteredObligations.reduce((acc, obligation) => {
            const dueDate = new Date(obligation.fecha_limite);
            dueDate.setHours(0, 0, 0, 0);
            
            if (obligation.estado === 'Presentado') {
                acc.completed++;
            } else if (obligation.estado === 'No aplica') {
                // Don't count "No aplica" in any category
            } else {
                acc.pending++;
                
                if (dueDate < today) {
                    acc.overdue++;
                } else if (dueDate <= nextWeek) {
                    acc.upcoming++;
                }
            }
            
            return acc;
        }, { pending: 0, overdue: 0, completed: 0, upcoming: 0 });

        const elements = ['pending-count', 'overdue-count', 'completed-count', 'upcoming-count'];
        const values = [stats.pending, stats.overdue, stats.completed, stats.upcoming];
        
        elements.forEach((elementId, index) => {
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = values[index];
            }
        });
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 100);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize the application
window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Google Sheets Tax Calendar App with production credentials');
    window.taxCalendarApp = new GoogleSheetsTaxCalendarApp();
});

// Export for global access
window.GoogleSheetsTaxCalendarApp = GoogleSheetsTaxCalendarApp;