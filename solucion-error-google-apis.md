# Solución al Error: "APIs de Google no disponibles. Usando modo demostración."

Este error indica que hay un problema con la configuración OAuth de Google o con el acceso a las APIs. Aquí tienes las soluciones paso a paso:

## Problema Identificado

El error aparece porque:
1. Las APIs de Google no están siendo cargadas correctamente
2. Hay problemas de configuración OAuth
3. Posibles restricciones de CORS en GitHub Pages
4. Las credenciales no están configuradas correctamente

## Solución 1: Verificar Configuración de Google Cloud Console

### Paso 1: Revisar OAuth 2.0 Client ID
1. **Ir a Google Cloud Console**: https://console.cloud.google.com/
2. **Seleccionar tu proyecto**
3. **Ir a "APIs & Services" > "Credentials"**
4. **Hacer clic en tu OAuth 2.0 Client ID**

### Paso 2: Configurar URLs Autorizadas
En la configuración del OAuth Client ID, agregar:

**Authorized JavaScript origins:**
```
https://TU-USUARIO.github.io
```

**Authorized redirect URIs:**
```
https://TU-USUARIO.github.io/calendario-tributario
https://TU-USUARIO.github.io/calendario-tributario/
```

### Paso 3: Verificar Estado de Publicación
1. **Ir a "OAuth consent screen"**
2. **Verificar que el estado sea:**
   - **Testing** (para desarrollo)
   - **In production** (para uso público)
3. **Si está en Testing**, agregar tu email en "Test users"

## Solución 2: Habilitar APIs Necesarias

### Paso 1: Habilitar Google Sheets API
1. **En Google Cloud Console**, ir a "APIs & Services" > "Library"
2. **Buscar "Google Sheets API"**
3. **Hacer clic en "Enable"**

### Paso 2: Verificar Quotas
1. **Ir a "APIs & Services" > "Quotas"**
2. **Verificar que no haya límites excedidos**

## Solución 3: Actualizar Código de la Aplicación

### Paso 1: Verificar Carga de APIs de Google
En tu archivo `index.html`, asegúrate de que las librerías se carguen en el orden correcto:

```html
<!-- IMPORTANTE: Cargar las APIs de Google en el orden correcto -->
<script src="https://apis.google.com/js/api.js"></script>
<script src="https://accounts.google.com/gsi/client"></script>
<!-- Tu aplicación debe cargar después -->
<script src="app.js"></script>
```

### Paso 2: Modificar app.js
Actualiza el método de inicialización para mejor manejo de errores:

```javascript
async initializeGoogleApis() {
    return new Promise((resolve, reject) => {
        // Verificar que gapi esté disponible
        if (typeof gapi === 'undefined') {
            console.error('Google APIs not loaded');
            this.showFallbackMode();
            reject(new Error('Google APIs not available'));
            return;
        }

        // Cargar el cliente con manejo de errores mejorado
        gapi.load('client', async () => {
            try {
                await gapi.client.init({
                    apiKey: this.API_KEY,
                    discoveryDocs: [this.DISCOVERY_DOC]
                });
                
                // Verificar que google.accounts esté disponible
                if (typeof google === 'undefined' || !google.accounts) {
                    throw new Error('Google Identity Services not available');
                }
                
                // Inicializar token client
                this.tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: this.CLIENT_ID,
                    scope: this.SCOPES,
                    callback: (response) => {
                        if (response.access_token) {
                            this.handleAuthSuccess(response);
                        } else {
                            this.handleAuthError(response);
                        }
                    }
                });
                
                console.log('Google APIs initialized successfully');
                resolve();
                
            } catch (error) {
                console.error('Error initializing Google APIs:', error);
                this.showFallbackMode();
                reject(error);
            }
        });
    });
}

showFallbackMode() {
    // Mostrar mensaje explicativo en lugar del error genérico
    const banner = document.getElementById('auth-banner');
    if (banner) {
        banner.innerHTML = `
            <div class="banner-content">
                <div class="banner-message error">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                    <span>Error de configuración: No se pueden cargar las APIs de Google. Verificar configuración OAuth.</span>
                </div>
                <button class="btn btn--secondary" onclick="location.reload()">
                    Reintentar
                </button>
            </div>
        `;
        banner.classList.remove('hidden');
    }
}
```

## Solución 4: Verificar Configuración de GitHub Pages

### Paso 1: Verificar HTTPS
GitHub Pages debe servir tu aplicación con HTTPS. La URL debe ser:
```
https://TU-USUARIO.github.io/calendario-tributario
```

### Paso 2: Agregar Archivo .htaccess (Si es necesario)
Crear archivo `.htaccess` en tu repositorio:
```
Header always set Access-Control-Allow-Origin "*"
Header always set Access-Control-Allow-Methods "GET, POST, OPTIONS, DELETE, PUT"
Header always set Access-Control-Allow-Headers "Content-Type, Authorization"
```

## Solución 5: Modo de Depuración

### Paso 1: Abrir Consola del Navegador
1. **Presionar F12** en tu navegador
2. **Ir a la pestaña "Console"**
3. **Buscar errores específicos**

### Paso 2: Revisar Errores Comunes
Los errores más comunes y sus soluciones:

**Error: "gapi is not defined"**
- Solución: Verificar que `https://apis.google.com/js/api.js` se carga correctamente

**Error: "google is not defined"**
- Solución: Verificar que `https://accounts.google.com/gsi/client` se carga correctamente

**Error: "Invalid client"**
- Solución: Verificar que el CLIENT_ID es correcto y está configurado para tu dominio

## Solución 6: Configuración Alternativa (Si persiste el problema)

### Opción A: Usar GitHub Codespaces
1. **En tu repositorio GitHub**, hacer clic en "Code" > "Codespaces"
2. **Crear nuevo Codespace**
3. **Probar la aplicación desde Codespaces**

### Opción B: Hosting Alternativo
Si GitHub Pages sigue dando problemas, considerar:
- **Netlify**: Deployment gratuito con mejor soporte CORS
- **Vercel**: Excelente para aplicaciones web estáticas
- **Firebase Hosting**: Integración nativa con Google APIs

## Solución Temporal: Datos de Demostración

Mientras se resuelve el OAuth, tu aplicación puede funcionar con datos de demostración. Modificar en `app.js`:

```javascript
async loadDataFromSheets() {
    try {
        // Intentar cargar desde Google Sheets primero
        if (this.isAuthenticated) {
            await this.loadRealSheetsData();
        } else {
            // Usar datos de demostración
            await this.loadDemoData();
        }
        
        this.updateSummaryCards();
        this.updateCalendar();
        this.updateFilters();
        
    } catch (error) {
        console.error('Error loading data:', error);
        // Fallback a datos de demostración
        await this.loadDemoData();
    }
}

async loadDemoData() {
    // Usar los datos reales del Google Sheets como demo
    this.obligations = [
        // ... todos los 99 registros reales aquí
    ];
    this.filteredObligations = [...this.obligations];
    console.log('Loaded demo data with', this.obligations.length, 'obligations');
}
```

## Verificación Final

### Lista de Verificación:
- [ ] OAuth Client ID configurado correctamente
- [ ] URLs autorizadas incluyen tu GitHub Pages URL
- [ ] Google Sheets API habilitada
- [ ] Estado de OAuth consent configurado
- [ ] Scripts de Google cargados en orden correcto
- [ ] Credenciales en app.js son correctas
- [ ] Consola del navegador sin errores críticos

## Resultado Esperado

Después de aplicar estas soluciones:
1. **El botón "Autorizar Acceso" funcionará**
2. **Se abrirá ventana de Google OAuth**
3. **Después de autorizar, los datos se cargarán desde Google Sheets**
4. **La aplicación será completamente funcional**

## Soporte Adicional

Si persiste el problema:
1. **Compartir errores específicos** de la consola del navegador
2. **Verificar configuración** paso a paso
3. **Considerar usar hosting alternativo** temporalmente

¡La aplicación debería funcionar correctamente una vez resueltos estos puntos de configuración!