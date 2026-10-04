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

**MusicGo** — Local-first YouTube→audio downloader. Paste a YouTube link, pick format, download.
- **Formats**: OPUS (original, default) · MP3 320k CBR · M4A AAC 320k · FLAC
- **Modes**: Simple (1 song) ↔ Queue (multi-URL, persistent, editable per-item)
- **Metadata**: Title/Artist editable, embedded in file (ID3/Vorbis/iTunes tags) + cover art
- **+18 rescue**: Auto-detects age-gate, fetches title/artist via YouTube oEmbed, downloads from SoundCloud
- **UI**: Glassmorphism, dark/light theme (persisted), Bootstrap Icons, responsive
- **Responsible use**: Own/licensed content only; respect platform ToS and local laws

---

## Architecture
```
MusicGo/
├── backend/          # FastAPI + yt-dlp + ffmpeg
│   ├── app.py        # Single file: endpoints, download, conversion, metadata
│   └── downloads/    # Temp files (auto-cleaned)
└── frontend/         # React 18 + Vite + React Router
    ├── src/
    │   ├── App.jsx           # Routes + theme toggle + Home (mode tabs)
    │   ├── components/
    │   │   ├── DownloadForm.jsx   # Simple mode (1 song)
    │   │   ├── QueueForm.jsx      # Queue mode (multi-url, persistent)
    │   │   └── CookieBanner.jsx
    │   ├── api.js            # fetch wrapper (POST /api/info, /api/download)
    │   └── styles.css        # Glassmorphism + dark/light theme (CSS vars)
    └── vite.config.js        # Proxy /api → 127.0.0.1:8000
```

---

## Key Commands
| Task | Command |
|------|---------|
| Install deps (once) | `pip install -r backend/requirements.txt && cd frontend && npm install` |
| Build frontend | `cd frontend && npm run build` |
| Lint/format | None configured (no ESLint/Prettier) |
| Typecheck | None (JS, no TypeScript) |
| Test | None configured |

---

## Requirements
- Python 3.12+
- Node.js 20+
- ffmpeg in PATH (https://www.gyan.dev/ffmpeg/builds/)
- Windows: `dev.bat` (double-click) launches both servers

---

## Critical Implementation Details

### Backend (`backend/app.py`)
- **Endpoints**:
  - `POST /api/info` — analyze URL → `{title, artist, duration, sizes, thumbnail, fallback}`
  - `POST /api/download` — streams audio file with metadata headers
  - `GET /api/progress` — polling for real-time progress (yt-dlp hook)
- **Formats**: `opus` (original, default), `mp3` (320k CBR), `m4a` (AAC 320k), `flac` (-8)
- **No re-encode when source matches target** (e.g. Opus→Opus = copy)
- **Metadata**:
  - YouTube returns `"Artist - Title"` in `title` field; `artist` often empty
  - `_split_artist_title()` regex parses separators ` - | – — :`, filters "Official Video"/"Lyrics"
  - User edits in UI override parsed values; sent via `req.title` / `req.artist`
  - Written via ffmpeg `-metadata title=... -metadata artist=...`
- **Opus tags**: Requires **re-encode** (`libopus 160k`) to write Vorbis Comments; remux (`-c:a copy`) drops tags
- **+18 rescue flow**:
  1. yt-dlp raises age-gate error
  2. YouTube oEmbed → title + author_name
  3. SoundCloud `scsearch10:"artist title"` → first result ≥60s
  4. Download via yt-dlp; sets `fallback` flag in headers
- **Cookies**: Optional `backend/cookies.txt` (Netscape format) for private videos
- **Headers**: `X-MusicGo-*` percent-encoded (latin-1 safe); frontend decodes with `decodeURIComponent`

### Frontend
- **Modes**: Simple (single URL) ↔ Queue (multi-line URLs, persisted in `localStorage`)
- **Queue features**:
  - Per-item format/title/artist/filename edit
  - Reorder (↑/↓), retry failed, delete
  - Global progress bar + per-item badges
  - Batch format dropdown (applies to all pending/error items)
  - `fileNameTouched` flag prevents auto-sync after manual filename edit
- **Theme**: `localStorage` persisted dark/light (`data-theme` on `<html>`), Bootstrap Icons CDN
- **Messages**: Transient (`flashMessage` auto-clears 5-10s); no sticky notices
- **Multiple-download permission**: Session banner in Queue mode (`sessionStorage` ack)
- **Vite proxy**: `/api` → `http://127.0.0.1:8000` (dev only)

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
| **OPUS** | yt-dlp `-f bestaudio` (copy) | ⭐ Archivar / mejor sonido |
| **MP3** | ffmpeg `libmp3lame -b:a 320k` | Coches, reproductores viejos |
| **M4A** | ffmpeg `aac -b:a 320k` | Equilibrio compatibilidad/calidad |
| **FLAC** | ffmpeg `flac -compression_level 8` | Solo con fuente lossless real |

---

## Common Gotchas
1. **Windows paths with spaces**: `dev.bat` uses `start /D` to avoid nested quotes; manual `cd` + `uvicorn` works too
2. **PowerShell curl**: JSON bodies **must** use `--data-binary "@file"` (inline JSON → 422)
3. **Opus metadata**: Must re-encode (`libopus 160k`) to get tags; original stream has none
4. **Title/Artist split**: YouTube returns `"Artist - Title"` in `title` field; `_split_artist_title()` handles separators ` - | – — :` and filters "Official Video"/"Lyrics"
5. **Queue persistence**: Survives reload; `fileNameTouched` flag prevents auto-sync after manual filename edit

---

## Test URL (end-to-end)
```
https://www.youtube.com/watch?v=dQw4w9WgXcQ
# Rick Astley, 213s: OPUS 3.29 MB, MP3 8.55 MB, M4A 8.70 MB, FLAC 45 MB
```

---

## Git / Release
- Default branch: `master`
- No CI, no pre-commit, no conventional commits enforced
- `dev.bat` launches both servers; keep terminals open