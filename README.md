# Dashboard de Salud Financiera y Riesgo Crediticio

Proyecto Final Integrador · **Software para Toma de Decisiones** · Instituto Tecnológico de Oaxaca · Grupo 7SB
Caso de estudio: *Sistema de Gestión para Caja de Ahorro Popular*

> 📄 El documento final está en [`docs/Proyecto_Final_Integrador.pdf`](docs/Proyecto_Final_Integrador.pdf).

---

## ⚡ Guía rápida (si ya está todo instalado)

Abre la carpeta del proyecto en **VS Code** y usa **3 terminales** (botón **+** del panel de terminal).
Cada una se queda abierta; no la cierres o se apaga esa parte.

| Terminal | Comandos | Qué debe salir |
|---|---|---|
| 1. Backend | `cd backend` → `npm start` | `API lista en http://localhost:4000` |
| 2. Frontend | `cd frontend` → `npm run dev` | `Local: http://localhost:5173/` |
| 3. (solo si hay que recargar datos) | `cd etl` → `..\.venv\Scripts\Activate.ps1` → `python etl.py` | `ETL terminado en X s` |

Abre **http://localhost:5173** en Chrome. Listo.

Antes de todo, **MongoDB debe estar encendido**: abre MongoDB Compass y conéctate a `localhost:27017`. Si conecta, está bien.

---

## 🧰 Instalación desde cero (Windows) — hacerlo UNA sola vez

### Paso 1. Instalar los programas

| Programa | Dónde se descarga | Notas |
|---|---|---|
| **Python 3.10 o más nuevo** | python.org/downloads | En el instalador marca **"Add python.exe to PATH"** |
| **Node.js (versión LTS)** | nodejs.org | Siguiente, siguiente, finalizar |
| **MongoDB Community Server** | mongodb.com/try/download/community | Elige **Complete**, deja marcado **"Install MongoD as a Service"** y **"Install MongoDB Compass"** |
| **VS Code** | code.visualstudio.com | Para abrir el proyecto |

Para comprobar, abre una terminal y escribe `python --version` y `node --version`. Deben mostrar un número de versión.

### Paso 2. Abrir el proyecto

En VS Code: **File → Open Folder…** y elige la carpeta `caja-ahorro-dashboard`.
Abre una terminal con **Terminal → New Terminal**.

### Paso 3. Crear el entorno de Python e instalar librerías

En la terminal (debe estar en la carpeta `caja-ahorro-dashboard`):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
cd etl
pip install -r requirements.txt
```

Al inicio de la línea debe aparecer **`(.venv)`**. Eso significa que el entorno está activo.

> Si VS Code muestra un menú **"Select an environment manager"**, elige **Quick Create venv** y luego sigue igual desde `.\.venv\Scripts\Activate.ps1`.

### Paso 4. Verificar MongoDB

Abre **MongoDB Compass** → **Add new connection** → deja `mongodb://localhost:27017` → **Save & Connect**.
Debe decir *Connected to localhost:27017*.

### Paso 5. Crear los datos y correr el ETL

En la misma terminal con `(.venv)` y dentro de `etl`:

```powershell
python generar_datos_operacion.py
python etl.py
```

- El primero crea la base `caja_ahorro` (3 instituciones, 2,600 socios, ~110 mil movimientos…).
- El segundo crea la base `caja_ahorro_analitica` y termina con `ETL terminado en X s`.
- En Compass, da clic en el ícono de refrescar y verás las dos bases nuevas.

### Paso 6. Levantar el backend (API)

Abre una **terminal nueva** (+):

```powershell
cd backend
npm install
npm start
```

Debe decir `MongoDB conectado: caja_ahorro_analitica` y `API lista en http://localhost:4000`.
Prueba en el navegador: http://localhost:4000/api/resumen (sale texto en JSON).

### Paso 7. Levantar el frontend (dashboard)

Abre **otra terminal nueva** (+):

```powershell
cd frontend
npm install
npm run dev
```

Abre **http://localhost:5173** en Chrome. 🎉

---

## 🧯 Errores comunes y cómo resolverlos

| Error que aparece | Qué significa | Solución |
|---|---|---|
| `/c:/Desarrollo... no se reconoce como nombre de un cmdlet` | VS Code armó mal la ruta porque la carpeta tiene espacios | Activa el entorno a mano: `.\.venv\Scripts\Activate.ps1` (o `..\.venv\Scripts\Activate.ps1` si estás dentro de `etl`) |
| `la ejecución de scripts está deshabilitada en este sistema` | Windows bloquea el script de activación | Corre una vez: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` y vuelve a activar |
| `python no se reconoce...` | Python no está en el PATH | Reinstala Python marcando **"Add python.exe to PATH"** |
| `ModuleNotFoundError: No module named 'pandas'` (o pymongo) | El entorno `(.venv)` no está activo | Actívalo y corre `pip install -r requirements.txt` dentro de `etl` |
| `ServerSelectionTimeoutError` o `No se pudo conectar a MongoDB` | MongoDB está apagado | PowerShell **como administrador**: `net start MongoDB` |
| `WARNING API SNIIV no disponible` | No hay internet o la página del SNIIV no responde | No pasa nada: el ETL sigue sin esa fuente. Vuelve a correrlo con internet |
| `EADDRINUSE: address already in use :::4000` | El backend ya está corriendo en otra terminal | Usa esa terminal, o ciérrala y vuelve a correr `npm start` |
| El dashboard dice *"No se pudo cargar el dashboard"* | El backend no está encendido | Revisa la terminal del backend (`npm start`) |
| `npm no se reconoce...` | Node.js no está instalado | Instala Node.js LTS y abre una terminal nueva |

---

## 🗂️ Qué hay en cada carpeta

```
caja-ahorro-dashboard/
├── etl/                          ← Python: saca, limpia y resume los datos
│   ├── generar_datos_operacion.py   Crea los datos de la caja (simulados)
│   ├── extract.py                   E: lee MongoDB, FONACOT (CSV) y SNIIV (API)
│   ├── transform.py                 T: limpia, aplica reglas y resume por mes
│   ├── load.py                      L: guarda el resultado en la base analítica
│   ├── etl.py                       Ejecuta E → T → L
│   ├── config.py                    Configuración (fecha de corte, metas, URLs)
│   └── datos_abiertos/              CSV reales de FONACOT (4.º trimestre 2025)
├── backend/                      ← Node.js + Express: la API que calcula los KPIs
├── frontend/                     ← React: el dashboard que ve el gerente
└── docs/                         ← Documento final en PDF
```

## 🔌 Endpoints de la API

| Ruta | Qué devuelve |
|---|---|
| `/api/filtros` | Instituciones, afiliaciones y meses para los filtros |
| `/api/resumen` | Los 5 KPIs de arriba |
| `/api/tendencias` | Morosidad mensual, depósitos vs retiros, aprobación |
| `/api/causa-raiz` | Morosidad por afiliación y empresa, operaciones por canal |
| `/api/detalle` | Top 10 de vencidos y la gráfica de dispersión |
| `/api/datos-abiertos` | Comparativo con FONACOT y SNIIV |

Todos aceptan filtros: `?desde=2026-01&hasta=2026-10&institucion=CAJA-01&afiliacion=Individual`

## 📊 Fuentes de datos

| Fuente | ¿Real o simulada? |
|---|---|
| Operación de la caja (socios, movimientos, préstamos, reclamaciones) | **Simulada** con `generar_datos_operacion.py` (semilla fija, siempre da lo mismo) |
| FONACOT – trabajadores y montos de crédito por género y entidad (datos.gob.mx) | **Real**, 4.º trimestre 2025 |
| SNIIV – financiamientos de vivienda en Oaxaca (API de SEDATU) | **Real**, se consulta en vivo al correr el ETL |

## 👥 Equipo

Martínez López Eduardo Manuel (líder) · Ortega Reyes Gerardo Yave · Pablo Delgado Evelin Aleida ·
León Ramírez Carlos Pavel · Cruz Cid Deyanira · Gómez García Paris Lizette
Docente: Hernández Luis Moisés Adrián
