# Calendario Tributario con Supabase

## Descripción
Esta aplicación ha sido migrada de Google Sheets a Supabase como base de datos. Ahora utiliza Supabase para almacenar y gestionar las obligaciones tributarias.

## Cambios Realizados

### 1. Configuración de Supabase
- Se reemplazó la configuración de Google Sheets API con Supabase
- URL de Supabase: `https://zmttoeuxnmavjvnfldyr.supabase.co`
- Tabla: `Calendario Tributario`

### 2. Estructura de la Tabla en Supabase
La tabla debe tener los siguientes campos:
```sql
CREATE TABLE "Calendario Tributario" (
    id BIGSERIAL PRIMARY KEY,
    abreviatura TEXT,
    entidad TEXT,
    obligacion TEXT,
    periodo TEXT,
    fecha_limite DATE,
    estado TEXT DEFAULT 'Pendiente',
    empresa TEXT,
    responsable TEXT,
    notas TEXT,
    fecha_presentacion DATE,
    monto TEXT,
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3. Funcionalidades
- ✅ **Conexión a Supabase**: Reemplazó la autenticación de Google
- ✅ **Lectura de datos**: `loadSupabaseData()` carga los datos desde Supabase
- ✅ **Actualización de datos**: `safeSupabaseUpdate()` actualiza registros en Supabase
- ✅ **Interfaz actualizada**: Botones y mensajes cambiados de Google a Supabase
- ✅ **Datos de demostración**: Fallback cuando no hay conexión a Supabase

### 4. API de Supabase Utilizada
```javascript
// Leer datos
const { data, error } = await supabase
    .from('Calendario Tributario')
    .select('*')
    .order('id', { ascending: true });

// Actualizar datos
const { error } = await supabase
    .from('Calendario Tributario')
    .update({...})
    .eq('id', data.id);
```

## Cómo usar

### 1. Configuración en Supabase
1. Crear la tabla con el esquema proporcionado arriba
2. Configurar las políticas RLS (Row Level Security) si es necesario
3. Obtener la URL y la clave anónima del proyecto

### 2. Ejecución local
```bash
# Navegar al directorio del proyecto
cd calendario-tributario-full

# Ejecutar servidor local
python -m http.server 8000

# Abrir en el navegador
# http://localhost:8000
```

### 3. Uso de la aplicación
1. Al cargar, mostrará datos de demostración
2. Hacer clic en "Conectar a Supabase" para conectar a la base de datos real
3. Los datos se cargarán automáticamente desde Supabase
4. Se pueden editar registros y se sincronizarán con Supabase

## Archivos Modificados

### `app.js`
- Reemplazó toda la lógica de Google Sheets con Supabase
- Nuevas funciones: `initializeSupabase()`, `loadSupabaseData()`, `safeSupabaseUpdate()`
- Eliminó dependencias de Google APIs

### `index.html`
- Cambió referencias de Google a Supabase en la interfaz
- Removió scripts de Google APIs
- Cambió el tipo de script a `module` para soportar imports ES6

### `style.css`
- Sin cambios (mantiene el diseño original)

## Beneficios de la Migración

1. **Independencia**: No depende de APIs de Google
2. **Flexibilidad**: Supabase ofrece más control sobre los datos
3. **Escalabilidad**: Mejor para aplicaciones web modernas
4. **Tiempo real**: Capacidad para actualizaciones en tiempo real (futuro)
5. **Seguridad**: Control granular de acceso con RLS

## Próximos Pasos

1. Configurar autenticación de usuarios en Supabase
2. Implementar subscripciones en tiempo real
3. Añadir funcionalidades CRUD completas (crear, eliminar registros)
4. Implementar políticas de seguridad RLS
5. Configurar backups automáticos

## Soporte

Para cualquier problema o pregunta sobre la migración, consulte la documentación de Supabase: https://supabase.com/docs
