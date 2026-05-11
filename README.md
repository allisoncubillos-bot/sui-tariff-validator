# BIA Energy — Validador SUI tarifario (Web)

App web autocontenida que parsea el Excel origen mensual, **reconstruye y valida T3/T7 (publicación) y T4/T8 (republicación)**, **compara** contra archivos provisionales y **descarga** los xlsx finales con 5 decimales de precisión — todo dentro del navegador del usuario, sin servidor.

Stack: **Vite + React + TypeScript + ExcelJS**. Está pensada para subirse tal cual a **Lovable**.

---

## 🚀 Cómo desplegar en Lovable

Hay 3 caminos. **El recomendado es el #1**.

### Camino 1 — GitHub → Lovable (recomendado)

Este flujo te permite seguir editando el código localmente y que Lovable detecte los cambios automáticamente.

1. **Crear repo en GitHub** (público o privado):
   ```powershell
   cd "C:\Users\User\Documents\sui-tariff-system-web"
   git init
   git add .
   git commit -m "feat: validador SUI inicial"
   gh repo create bia-energy/sui-tariff-validator --private --source=. --push
   ```
   (Si no tenés `gh` instalado: `winget install GitHub.cli`, luego `gh auth login`.)

2. **En Lovable** ([lovable.dev](https://lovable.dev)):
   - Crear cuenta / iniciar sesión.
   - Click **"New Project"** → **"Import from GitHub"**.
   - Autorizar acceso al repo `bia-energy/sui-tariff-validator`.
   - Lovable detectará automáticamente que es un proyecto Vite+React.

3. **Iterar con prompts** dentro de Lovable. La UI ya es funcional, pero podés pedir cosas como:
   > "Cambiá el tema a claro y usá shadcn/ui Cards y Buttons en lugar del CSS custom."
   >
   > "Agregá un panel lateral con el historial de los últimos 10 archivos procesados."
   >
   > "Conectá a Supabase para guardar los resultados de cada corrida con timestamp."

### Camino 2 — Subir el zip directo

Si no querés crear un repo GitHub:

1. Empaquetar el proyecto:
   ```powershell
   cd "C:\Users\User\Documents"
   Compress-Archive -Path sui-tariff-system-web -DestinationPath sui-tariff-system-web.zip -Force
   ```
2. En Lovable: **"New Project"** → **"Upload"** → arrastrar el zip.

### Camino 3 — Prompt + pegado de código

Para empezar desde cero en Lovable y dejar que su IA arme todo:

1. Abrí Lovable y creá nuevo proyecto con este prompt:
   > "Necesito una app interna para BIA Energy que valide formatos tarifarios SUI (T3, T4, T7, T8) de Colombia. La app permite al usuario subir un Excel origen (reporte visual mensual de tarifas) y los formatos provisionales para comparar. Tiene dos modos: Publicación (genera T3 y T7) y Republicación (genera T4 y T8 sustituyendo solo los mercados republicados). Todo el procesamiento es 100% en el navegador con ExcelJS. La UI debe tener tabs Publicación/Republicación, inputs de archivos drag-and-drop, panel de validaciones y diferencias, y botones de descarga de los xlsx finales con 5 decimales. Usar React + TypeScript + Tailwind + shadcn/ui."
2. Una vez generado el skeleton, pegale en el chat el contenido de [src/lib/web/api.ts](src/lib/web/api.ts) y pedile que lo use como núcleo de la lógica.

---

## ❓ ¿Hay que subir el README?

**Sí**, conviene incluirlo porque:
- Lovable lo usa como contexto adicional cuando le pedís cambios.
- Documenta para vos / tu equipo el dominio del problema.
- En GitHub queda renderizado en la home del repo.

**Lo único que NO subas**:
- `node_modules/` (ya en `.gitignore`)
- Archivos xlsx reales con datos de BIA si el repo es público.

---

## 📁 Estructura del proyecto

```
sui-tariff-system-web/
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
└── src/
    ├── main.tsx            # entry React
    ├── App.tsx             # UI principal (tabs, file inputs, ejecutar)
    ├── styles.css
    ├── components/
    │   ├── FileInput.tsx   # input drag-drop estilizado
    │   └── ResultsPanel.tsx# panel de validaciones + diffs + descargas
    └── lib/                # NÚCLEO DE LA LÓGICA (idéntico al backend)
        ├── types.ts
        ├── domain/         catálogo mercados + niveles + constantes
        ├── parsers/        lectura xlsx (acepta File/ArrayBuffer)
        ├── generators/     construcción T3/T4/T7/T8
        ├── validators/     estructura, math, semántica, comparación
        ├── exporters/      writer xlsx con 5 decimales
        └── web/
            └── api.ts      ← FUNCIONES BROWSER-FRIENDLY
                              (runPublicationBrowser, runRepublicationBrowser)
```

---

## ▶ Desarrollo local

```powershell
cd "C:\Users\User\Documents\sui-tariff-system-web"
npm install
npm run dev        # http://localhost:5173
npm run build      # output a dist/
npm run preview    # sirve dist/
```

---

## 🧩 Cómo funciona el procesamiento

Todo corre **100% en el navegador del usuario** — los xlsx nunca salen de la máquina:

1. El usuario hace clic en un `<input type="file">` y selecciona un xlsx.
2. JavaScript convierte el `File` → `ArrayBuffer` con `file.arrayBuffer()`.
3. ExcelJS lo carga en memoria con `workbook.xlsx.load(buffer)`.
4. La lógica de `src/lib/` parsea, valida, genera.
5. Los xlsx finales se construyen con `workbook.xlsx.writeBuffer()` → `Blob`.
6. Un `<a download>` dispara la descarga al disco del usuario.

No hay servidor. No hay base de datos. **No hay riesgo de filtración** (los archivos nunca dejan el navegador).

> Si en el futuro querés persistir resultados o tener cuentas multi-usuario, Lovable integra Supabase con un click — la lógica de `src/lib/` se importa tal cual desde un Edge Function.

---

## 🔍 Hallazgos clave del dominio (referencia)

Estos están documentados también en los comentarios del código fuente y conviene tenerlos a la vista cuando audites resultados:

- **Etiquetas cruzadas en el Excel visual**: columna D dice "Cvm" pero contiene PR; columna G dice "PR nm" pero contiene Cvm. El parser usa la ecuación `CU = Gm+Tm+Rm+Dm+PR+Cvm` para detectar la posición real — ver [src/lib/parsers/column-inference.ts](src/lib/parsers/column-inference.ts).
- **T7 BIA convention**: `T7.prnm` almacena Cvm base, `T7.cvm` almacena Cvm+COT, `T7.cuvm` almacena CU+COT (no CU base). Ver [src/lib/types.ts](src/lib/types.ts).
- **T3 column order**: I=100%, J=0%, K=50% (los cols J/K vienen invertidos vs F/G/H del % subsidio). Ver [src/lib/parsers/format-parsers.ts](src/lib/parsers/format-parsers.ts).
- **Catálogo `MERCADOS`** verificado automáticamente contra T3 2026-04 — 20 mercados de BIA Energy. Ver [src/lib/domain/mercados.ts](src/lib/domain/mercados.ts).

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

## 💡 Próximas iteraciones sugeridas (para pedir a Lovable)

- Tema claro / oscuro toggle.
- Sustituir CSS plano por **shadcn/ui** (Card, Tabs, Button, Alert, Table).
- Agregar **Supabase** para histórico de corridas y multi-usuario.
- Export del reporte de validación a **PDF**.
- **Persistir** la `EstratoConfig` por mercado (subsidios efectivos) en localStorage.
- Detección automática del **diario** y la **fecha de publicación** desde el filename del Excel origen.
