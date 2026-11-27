# AGENTS.md — MusicGo

## Quick Start
```bash
# Development (preferred)
dev.bat                    # double-click: starts backend (8000) + frontend (5173)

# Manual dev (two terminals)
cd backend && python -m uvicorn app:app --host 127.0.0.1 --port 8000
cd frontend && npm run dev
```

**Ports**: Backend 8000, Frontend 5173. `dev.bat` handles paths with spaces correctly.

---

## Project Overview

**MusicGo 2.0** — Local-first YouTube→audio downloader + reproductor + biblioteca local. Busca por nombre o pega un enlace, elige formato, descarga.
- **Formats**: OPUS (original, default, sin recodificar) · MP3 320k CBR · M4A (AAC original) · FLAC
- **Entry**: buscador por nombre (`/api/search`) **o** enlace/playlist (`/api/playlist`)
- **Queue**: multi-pista persistente, editable por item, con progreso por pista y cancelación
- **Biblioteca**: historial local en `localStorage` (formato, tamaño, fecha, fuente, carátula)
- **Reproductor**: mini-player fijo con previews (`blob:`) y seek
- **Metadata**: título/artista/álbum/género/año/pista embebidos (ID3/Vorbis/iTunes) + carátula
- **Rescue flow**: Auto-detects age-gate **o bloqueo Music Premium/members-only**, obtiene título/artista vía YouTube oEmbed y descarga desde SoundCloud
- **UI**: "Mosaico denso japonés" (papel claro, tipografía compacta, reglas capilares, rojo de señal), dark/light persistido, responsive real a 390 px
- **Responsible use**: Own/licensed content only; respect platform ToS and local laws. Aviso discreto en pie + páginas legales

---

## Architecture
```
MusicGo/
├── backend/          # FastAPI + yt-dlp + ffmpeg
│   ├── app.py        # Single file: endpoints, tasks, download, conversion, metadata
│   ├── downloads/    # Temp files (auto-cleaned)
│   └── previews/     # Cache de previews 12 h (auto-cleaned)
└── frontend/         # React 18 + Vite + React Router 6
    ├── src/
    │   ├── App.jsx                  # Rutas + ThemeProvider + layout
    │   ├── main.jsx                 # Bootstrap Icons local + estilos
    │   ├── api.js                   # fetch wrapper de toda la API
    │   ├── formats.js               # Definición de OPUS/MP3/M4A/FLAC
    │   ├── utils.js                 # formatBytes, formatClock, formatDate
    │   ├── context/
    │   │   ├── QueueContext.jsx     # cola persistente + polling + cancelación
    │   │   ├── LibraryContext.jsx   # historial (musicgo-library-v1)
    │   │   ├── PlayerContext.jsx    # mini-player, previews, volumen, seek
    │   │   └── ToastContext.jsx     # avisos transitorios con acción
    │   ├── components/
    │   │   ├── Module.jsx           # módulo + rail (primitivas del mosaico)
    │   │   ├── PageHead.jsx         # cabecera de página (+ Stat)
    │   │   ├── TopBar.jsx           # nav fija, badge de cola, estado
    │   │   └── Footer.jsx           # aviso de uso responsable
    │   ├── pages/
    │   │   ├── DownloadPage.jsx     # buscador/enlace, ficha, formatos, Recientes
    │   │   ├── QueuePage.jsx        # cola editable + lote
    │   │   ├── LibraryPage.jsx      # tabla densa con filtros y orden
    │   │   ├── Privacy.jsx          # /privacidad
    │   │   └── Terms.jsx            # /terminos
    │   ├── assets/fonts/            # Zen Kaku Gothic New + Barlow Condensed (autoalojadas)
    │   └── styles.css               # Sistema de diseño completo (tokens, módulos, responsive)
    └── vite.config.js               # Proxy /api → 127.0.0.1:8000
```

**Rutas**: `/` (Descargar) · `/cola` · `/biblioteca` · `/privacidad` · `/terminos`

---

## Key Commands
| Task | Command |
|------|---------|
| Install deps (once) | `pip install -r backend/requirements.txt && cd frontend && npm install` |
| Build frontend | `cd frontend && npm run build` |
| Lint/format | None configured (no ESLint/Prettier) |
| Typecheck | None (JS, no TypeScript) |
| Test | None configured |
| Auditoría visual | `npx impeccable detect http://localhost:5173` (con el dev server arriba) |

---

## Requirements
- Python 3.12+
- Node.js 20+
- ffmpeg in PATH (https://www.gyan.dev/ffmpeg/builds/)
- Windows: `dev.bat` (double-click) launches both servers

---

## Critical Implementation Details

### Backend (`backend/app.py`)
- **`APP_VERSION = "2.0.0"`**
- **Endpoints**:
  - `POST /api/info` — analiza URL → `{title, artist, raw_title, duration, sizes, thumbnail, fallback}` (artista/título ya separados)
  - `POST /api/search` — `{query, limit}` → resultados ligeros (`id, url, title, artist, raw_title, duration, thumbnail`); cache 5 min
  - `POST /api/playlist` — expande playlist/URL de lista → misma forma que search
  - `POST /api/preview` — recorta audio (~30 s) y lo sirve cacheado 12 h en `previews/` (cabecera de estado de caché)
  - `POST /api/download` — descarga + convierte + etiqueta; responde el archivo con headers `X-MusicGo-*`
  - `GET /api/tasks/{task_id}` — estado de una tarea: `{stage, percent, status, ...}` (404 si no existe)
  - `POST /api/tasks/{task_id}/cancel` — marca `cancel`; el hilo aborta y la descarga devuelve **499**
  - `GET /api/progress` — progreso global heredado (compatibilidad)
- **Tasks**: dict en memoria `TASKS` con `task_create/task_update/task_check`; el hook de yt-dlp escribe porcentaje por etapa (descarga → conversión → etiquetado) y aborta en cuanto `cancel` es cierto.
- **Formats**: `opus` (original, default), `mp3` (320k CBR), `m4a` (AAC original; 320k si convierte), `flac` (-8)
- **No re-encode when source codec matches target**: se decide con `audio_codec()` (ffprobe), no por extensión
- **Metadata**:
  - YouTube returns `"Artist - Title"` in `title` field; `artist` often empty
  - `_split_artist_title()` regex parses separators ` - | – — :`, filters "Official Video"/"Lyrics"; se aplica también en `/api/info` y en cada resultado de búsqueda (`raw_title` conserva el original)
  - Campos extendidos: `album`, `genre`, `year` (→ `date`), `track` (además de title/artist); el usuario puede editarlos en la ficha
  - Written via ffmpeg `-metadata title=... -metadata artist=... -metadata album=... -metadata genre=... -metadata date=... -metadata track=...`
- **Opus tags**: `-c:a copy` + contenedor **Ogg** (`-f ogg`) **sí** escribe Vorbis Comments y deja el audio **bit a bit idéntico**. Solo se recodifica (`libopus 160k`) cuando la fuente NO es Opus (p. ej. rescate AAC de SoundCloud). *Remux a WebM/.mka sí perdería los tags.*
- **Cover art**: Ogg Opus **NO** admite carátula adjunta (se omite en OPUS); MP3/M4A/FLAC sí (la imagen se regraba siempre a JPEG para evitar webp/formatos no soportados)
- **Rescue flow** (`is_rescuable_block_error` = age-gate **o** Music Premium/members-only):
  1. yt-dlp raises age-gate / Premium / members-only / login error
  2. YouTube oEmbed → title + author_name
  3. SoundCloud `scsearch10:"artist title"` → first result ≥60s
  4. Download via yt-dlp; sets `fallback` flag in headers
  - Aviso: el rescate trae una **copia subida por un tercero** (no es el audio original de YouTube); si la fuente rescatada es AAC, OPUS exigirá recodificar (M4A no)
- **Cookies**: Optional `backend/cookies.txt` (Netscape format) para vídeos privados/**Premium** (única vía al original de YouTube)
- **Headers**: `X-MusicGo-*` percent-encoded (latin-1 safe); frontend decodes with `decodeURIComponent`
- **Limpieza**: `downloads/` > 1 día y `previews/` > 12 h se borran al arrancar (lifespan)

### Frontend
- **Tema**: `localStorage` (`musicgo-theme`) → `data-theme` en `<html>`; toggle en la topbar. Bootstrap Icons se importa desde npm (`bootstrap-icons`), **sin CDN** → funciona offline
- **Fuentes**: autoalojadas en `src/assets/fonts/` (`@font-face` en `styles.css`); `index.html` hace `preload` de las 4 woff2 críticas
- **Cola** (`QueueContext`): persistida en `localStorage` (`musicgo-queue-v1`)
  - Edición por item (título, artista, formato, nombre de archivo); `fileNameTouched` evita re-sincronizar tras edición manual
  - Reordenar (↑/↓), reintentar errores, eliminar, añadir desde búsqueda/biblioteca/playlist
  - Polling por tarea (`getTask`) → porcentaje y etapa por pista; `cancelTask` aborta en backend
  - Formato global de lote para items pendientes/con error
- **Biblioteca** (`LibraryContext`): `musicgo-library-v1`; guarda título, artista, álbum, año, formato, tamaño, fecha, fuente (`fallback`), `fileName` y miniatura remota
- **Reproductor** (`PlayerContext`): previews vía `getPreviewBlob` → `URL.createObjectURL`; cola de audio, volumen, seek, cierre; el objeto fijo mide 60 px
- **Avisos** (`ToastContext`): cola de toasts con acción opcional (REPRODUCIR, IR A LA COLA) y autocierre
- **Permiso de descargas múltiples**: aviso en `/cola` aceptado una vez por sesión (`sessionStorage`)
- **Vite proxy**: `/api` → `http://127.0.0.1:8000` (dev only)

### Diseño
- Documentado en `DESIGN.md` (contrato de dirección, tokens, retícula, componentes, no-hacer) y `PRODUCT.md` (verdad de producto).
- Reglas duras: radio 0, base 15 px, suelo de 11 px para texto funcional, rojo solo como señal, sin glassmorphism ni degradados decorativos. Contenedor máximo 1680 px (barra, contenido, reproductor y pie comparten ancho).
- En móvil (< 760 px) la tabla de biblioteca se reordena como fichas con grid (`grid-template-areas`), sin scroll horizontal.

---

## Audio Quality Philosophy (Core Decision)
> **La calidad la pone la FUENTE, no la conversión.** Recodificar nunca mejora el sonido: solo lo conserva o degrada.

| Fuente YouTube | Códec | Calidad máx. |
|---|---|---|
| bestaudio | **Opus** | ~160 kbps |
| alternativa | AAC | ~256 kbps |

**Regla de oro**: El mejor archivo posible es **el original sin recodificar (OPUS)**.
- MP3/M4A/FLAC son *conversiones* para compatibilidad, no calidad superior
- FLAC desde YouTube = FLAC "de mentira" (archivo gigante, misma calidad que Opus)

| Formato | Método interno | Cuándo usarlo |
|---|---|---|
| **OPUS** | ffmpeg `-c:a copy -f ogg` + tags (sin recodificar) | ⭐ Archivar / mejor sonido |
| **MP3** | ffmpeg `libmp3lame -b:a 320k` | Coches, reproductores viejos |
| **M4A** | ffmpeg `-c:a copy` si la fuente es AAC; si no `aac -b:a 320k` | Equilibrio compatibilidad/calidad |
| **FLAC** | ffmpeg `flac -compression_level 8` | Solo con fuente lossless real |

---

## Common Gotchas
1. **Windows paths with spaces**: `dev.bat` uses `start /D` to avoid nested quotes; manual `cd` + `uvicorn` works too
2. **PowerShell curl**: JSON bodies **must** use `--data-binary "@file"` (inline JSON → 422)
3. **Opus metadata**: `-c:a copy` **sí** escribe tags si el destino es Ogg (`-f ogg`); recodifica solo si la fuente no es Opus. Ogg no admite carátula adjunta
4. **Tags en Opus = stream tags**: ffprobe los muestra en `stream_tags`, no en `format_tags`; verifica ahí
5. **Title/Artist split**: YouTube returns `"Artist - Title"` in `title` field; `_split_artist_title()` handles separators ` - | – — :` and filters "Official Video"/"Lyrics"
6. **Cola persistente**: sobrevive al recargar; `fileNameTouched` evita re-sincronizar tras edición manual
7. **Cancelar descarga**: `POST /api/tasks/{id}/cancel` hace que el hilo aborte y `/api/download` responda 499; el frontend lo trata como cancelación, no como error
8. **Reiniciar backend tras editar `app.py`**: se levanta sin `--reload`
9. **Previews**: se cachean 12 h en `backend/previews/`; si cambian los recortes, borra esa carpeta

---

## Test URL (end-to-end)
```
https://www.youtube.com/watch?v=dQw4w9WgXcQ
# Rick Astley, 213s: OPUS 3.29 MB, MP3 8.55 MB, M4A 8.70 MB, FLAC 45 MB

https://www.youtube.com/watch?v=a5uQMwRMHcs   # Daft Punk — Instant Crush (búsqueda "Daft Punk")
```

---

## Git / Release
- Default branch: `master`
- No CI, no pre-commit, no conventional commits enforced
- `dev.bat` launches both servers; keep terminals open
