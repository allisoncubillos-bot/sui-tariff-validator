# BIA Energy — Validador SUI tarifario (local + BD)

App web que parsea el Excel origen mensual, **reconstruye y valida T3/T7 (publicación), T4/T8 (republicación) y T9 (variables CU 119)**, **compara** contra archivos provisionales y **descarga** los xlsx finales con 5 decimales — todo el procesamiento de archivos ocurre **en el navegador** (ExcelJS, sin subir los xlsx a ningún servidor).

Adicionalmente, cada corrida se **persiste como auditoría** en una base de datos PostgreSQL local a través de un pequeño backend, con una pestaña **Historial** para consultarlas.

> Este proyecto nació en Lovable. Ya **no depende de Lovable**: corre 100% local. Se removió el scaffold de shadcn/ui que Lovable generaba y no se usaba (ver `git log`).

---

## 🏗 Arquitectura

```
┌──────────────────────┐        POST/GET /api/runs        ┌─────────────────────┐        ┌──────────────┐
│  Frontend (Vite)     │ ───────────────────────────────► │  Backend (Express)  │ ─────► │  PostgreSQL  │
│  React + ExcelJS     │        (proxy /api en dev)        │  Node + pg          │        │  local       │
│  parseo/validación   │ ◄─────────────────────────────── │  /api/runs, /health │        │ validation_  │
│  en el navegador     │        historial de corridas      │                     │        │   runs       │
└──────────────────────┘                                   └─────────────────────┘        └──────────────┘
```

- El **parseo, validación y generación** de los xlsx sigue siendo 100% cliente. Los archivos nunca salen del navegador.
- Lo que se envía al backend es solo el **registro de auditoría** de cada corrida (metadatos de archivos, diagnósticos, validaciones y diferencias) — no los xlsx.

---

## ✅ Prerrequisitos

- **Node.js ≥ 20** (probado con 22.x) y npm.
- **PostgreSQL ≥ 13** corriendo localmente (probado con 17).

---

## 🚀 Puesta en marcha (local)

### 1. Instalar dependencias

```powershell
# Frontend (raíz del repo)
npm install

# Backend
cd server
npm install
cd ..
```

### 2. Crear la base de datos

Con PostgreSQL instalado y corriendo (usuario `postgres`):

```powershell
# Ajusta la ruta a psql según tu versión
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "CREATE DATABASE sui_validator;"
```

### 3. Configurar el backend

```powershell
cd server
copy .env.example .env      # edita .env si tu usuario/clave/puerto difieren
```

`server/.env`:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sui_validator
PORT=8787
CORS_ORIGINS=http://localhost:5173,http://localhost:5180
```

### 4. Correr las migraciones

```powershell
cd server
npm run migrate
```

Crea la tabla `validation_runs` y sus índices.

### 5. Levantar backend + frontend

En **dos terminales**:

```powershell
# Terminal 1 — backend
cd server
npm run dev        # http://localhost:8787  (GET /health para verificar)
```

```powershell
# Terminal 2 — frontend
npm run dev        # http://localhost:5173
```

El dev server de Vite proxea `/api` y `/health` al backend, así que no hay que configurar CORS en desarrollo. Abre la pestaña **Historial** para ver las corridas guardadas.

---

## 🔧 Variables de entorno

| Dónde | Variable | Propósito | Default |
|-------|----------|-----------|---------|
| `server/.env` | `DATABASE_URL` | Conexión a PostgreSQL | `postgresql://postgres:postgres@localhost:5432/sui_validator` |
| `server/.env` | `PORT` | Puerto del backend | `8787` |
| `server/.env` | `CORS_ORIGINS` | Orígenes permitidos (CSV) | `http://localhost:5173,http://localhost:5180` |
| `.env` (raíz, opcional) | `VITE_API_URL` | URL del backend si NO se usa el proxy (ej. build de producción) | *(vacío → usa `/api`)* |

---

## 🗄 API del backend

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET`  | `/health` | Estado del servicio y de la BD. |
| `POST` | `/api/runs` | Guarda una corrida (auditoría). |
| `GET`  | `/api/runs?mode=&limit=&offset=` | Lista corridas (resumen). |
| `GET`  | `/api/runs/:id` | Detalle completo de una corrida. |

---

## 📁 Estructura del proyecto

```
sui-tariff-validator/
├── index.html
├── package.json            # frontend (Vite + React + ExcelJS)
├── vite.config.ts          # incluye proxy /api → backend
├── src/
│   ├── main.tsx            # entry React
│   ├── App.tsx             # UI principal (tabs: Publicación / Republicación / T9 / Historial)
│   ├── styles.css
│   ├── components/
│   │   ├── FileInput.tsx
│   │   ├── ResultsPanel.tsx
│   │   ├── T9Panel.tsx
│   │   └── HistoryPanel.tsx   # ← vista de historial (consume el backend)
│   └── lib/                # NÚCLEO DE LA LÓGICA
│       ├── types.ts
│       ├── domain/         # catálogo mercados + niveles + constantes
│       ├── parsers/        # lectura xlsx
│       ├── generators/     # construcción T3/T4/T7/T8/T9
│       ├── validators/     # estructura, math, semántica, comparación
│       ├── exporters/      # writer xlsx con 5 decimales
│       └── web/
│           ├── api.ts      # funciones browser (runPublicationBrowser, ...)
│           ├── report.ts   # reporte de texto
│           └── history.ts  # ← cliente del backend + builders de auditoría
└── server/                 # BACKEND
    ├── package.json        # Express + pg + tsx
    ├── .env.example
    ├── migrations/
    │   └── 001_init.sql    # tabla validation_runs
    └── src/
        ├── index.ts        # app Express + /health
        ├── db.ts           # pool de PostgreSQL
        ├── migrate.ts      # runner de migraciones
        └── routes/runs.ts  # POST/GET /api/runs
```

---

## 🔍 Hallazgos clave del dominio (referencia)

Documentados también en los comentarios del código; conviene tenerlos a la vista al auditar resultados:

- **Etiquetas cruzadas en el Excel visual**: columna D dice "Cvm" pero contiene PR; columna G dice "PR nm" pero contiene Cvm. El parser usa la ecuación `CU = Gm+Tm+Rm+Dm+PR+Cvm` para detectar la posición real — ver [src/lib/parsers/column-inference.ts](src/lib/parsers/column-inference.ts).
- **T7 BIA convention**: `T7.prnm` almacena Cvm base, `T7.cvm` almacena Cvm+COT, `T7.cuvm` almacena CU+COT (no CU base). Ver [src/lib/types.ts](src/lib/types.ts).
- **T3 column order**: I=100%, J=0%, K=50% (los cols J/K vienen invertidos vs F/G/H del % subsidio). Ver [src/lib/parsers/format-parsers.ts](src/lib/parsers/format-parsers.ts).
- **Catálogo `MERCADOS`** verificado contra T3 2026-04 — 20 mercados de BIA Energy. Ver [src/lib/domain/mercados.ts](src/lib/domain/mercados.ts).

---

## 🛡 Validaciones implementadas

| Validador | Qué chequea |
|-----------|-------------|
| `validateStructure` | Cantidad y nombre de columnas vs spec oficial. |
| `validateSourceMath` | Identidad `CU = Σ componentes` en el origen. |
| `validateT7Math` | Identidad `CU = Σ componentes` en el T7 generado. |
| `validateT3Consistency` | Orden de tarifas, Cfjm constante por mercado, % subsidio en rango. |
| `validateSemantic` | Cross-check origen ↔ T3 ↔ T7 (Cfjm, tarifas, componentes). |
| `compareT3 / compareT7` | Diff cell-by-cell vs provisional con tolerancia 1e-4. |

---

## 💡 Próximas iteraciones sugeridas

- Autenticación / `created_by` real por usuario en la auditoría.
- Guardar también los xlsx generados (blobs) y/o los archivos origen.
- Export del reporte de validación a PDF.
- Detección automática de **diario** y **fecha de publicación** desde el filename del Excel origen.
- Filtros por período y export CSV del historial.
