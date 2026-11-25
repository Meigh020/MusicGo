"""MusicGo — Backend.

Servidor FastAPI que:
  - Analiza un enlace de YouTube (título, artista, duración, tamaños estimados).
  - Descarga el audio original (yt-dlp) y lo convierte (ffmpeg) a OPUS/MP3/M4A/FLAC.
  - Detecta restricción de edad (+18) y rescata la pista desde SoundCloud
    (metadatos vía API pública oEmbed de YouTube), con aviso transparente.
  - Soporta cookies opcionales para videos privados vía backend/cookies.txt.
"""

from __future__ import annotations

import hashlib
import json
import mimetypes
import re
import shutil
import subprocess
import time
import urllib.parse
import urllib.request
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import yt_dlp
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

# ──────────────────────────────────────────────────────────────────────────────
# Helpers de parsing de título/artista
# ──────────────────────────────────────────────────────────────────────────────
# Preferir separadores con espacios: " - ", " – ", " — ", " | ", " : "
_SPLIT_RE = re.compile(
    r"^\s*(.+?)\s+(?:-|–|—|\|)\s+(.+?)\s*$"
    r"|^\s*(.+?)\s*:\s*(.+?)\s*$"  # "Artista: Título" (dos puntos sin espacios obligatorios)
)

def _split_artist_title(raw_title: str, fallback_artist: str = "") -> tuple[str, str]:
    """
    Intenta separar 'Artista - Título' del título bruto de YouTube.
    Devuelve (artist, title). Si no puede separar, usa fallback_artist y raw_title.
    """
    if not raw_title:
        return fallback_artist, "Audio"
    m = _SPLIT_RE.match(raw_title)
    if m:
        # Grupos 1,2 = separador con espacios; 3,4 = dos puntos
        artist = (m.group(1) or m.group(3) or "").strip()
        title = (m.group(2) or m.group(4) or "").strip()
        if len(artist) > 60 or artist.lower() in {"official video", "official audio", "lyrics", "audio", "video"}:
            return fallback_artist, raw_title
        return artist, title
    return fallback_artist, raw_title


BASE_DIR = Path(__file__).resolve().parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
PREVIEW_DIR = DOWNLOADS_DIR / "preview"
COOKIES_FILE = BASE_DIR / "cookies.txt"
DOWNLOADS_DIR.mkdir(exist_ok=True)
PREVIEW_DIR.mkdir(exist_ok=True)

APP_VERSION = "2.0.0"

# Clientes de YouTube que evitan muchos bloqueos (incluida parte de la restricción +18)
YT_CLIENT_OPTS = {
    "extractor_args": {"youtube": {"player_client": ["default", "android", "tv"]}}
}

FORMATS = ["opus", "mp3", "m4a", "flac"]
FORMAT_EXT = {"opus": ".opus", "mp3": ".mp3", "m4a": ".m4a", "flac": ".flac"}
FORMAT_LABEL = {
    "opus": "OPUS (original, sin recodificar)",
    "mp3": "MP3 320 kbps (CBR, máximo del MP3)",
    "m4a": "M4A (AAC original; 320 kbps si se convierte)",
    "flac": "FLAC (sin pérdida)",
}

# Bytes por segundo usados para estimar el tamaño de cada conversión.
BPS_ESTIMATE = {
    "mp3": 320_000 / 8,   # MP3 a 320 kbps CBR (bitrate fijo)
    "m4a": 320_000 / 8,   # AAC a 320 kbps (bitrate fijo)
    # Fuente habitual: Opus 48 kHz. WAV 48k/16bit estéreo = 192 KB/s.
    # El FLAC de una fuente "con pérdida" comprime peor (ruido de cuantización),
    # por eso se aplica un factor de ~1.1 → ~211 KB/s.
    "flac": 192_000 * 1.1,
}

# Progreso global (compatibilidad con /api/progress) + registro por tarea.
progress = {"task_id": None, "percent": 0, "stage": "inactivo"}
TASKS: dict[str, dict] = {}
MAX_TASKS = 40


class DownloadCancelled(Exception):
    """La descarga fue cancelada por el usuario."""


def task_create(task_id: str, title: str = "", stage: str = "En cola") -> dict:
    task = {
        "id": task_id,
        "title": title,
        "percent": 0,
        "stage": stage,
        "status": "running",
        "cancel": False,
        "error": None,
        "started": time.time(),
    }
    TASKS[task_id] = task
    if len(TASKS) > MAX_TASKS:
        for key in sorted(TASKS, key=lambda k: TASKS[k].get("started", 0))[: len(TASKS) - MAX_TASKS]:
            TASKS.pop(key, None)
    return task


def task_update(task_id: str | None, **fields) -> None:
    if not task_id:
        return
    task = TASKS.get(task_id)
    if not task:
        return
    task.update(fields)
    if "percent" in fields or "stage" in fields:
        progress.update(task_id=task_id, percent=task["percent"], stage=task["stage"])


def task_cancelled(task_id: str | None) -> bool:
    return bool(task_id and TASKS.get(task_id, {}).get("cancel"))


def task_check(task_id: str | None) -> None:
    if task_cancelled(task_id):
        raise DownloadCancelled()


def _progress_hook_factory(stage: str, base_pct: int, span: int, task_id: str | None = None):
    """Crea un hook de yt-dlp que actualiza el progreso real de la descarga."""
    def hook(d):
        task_check(task_id)
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            if total:
                pct = base_pct + (d.get("downloaded_bytes", 0) / total) * span
                if task_id:
                    task_update(task_id, stage=stage, percent=int(pct), status="downloading")
                else:
                    progress.update(stage=stage, percent=int(pct))
    return hook



# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def set_progress(stage: str, percent: int) -> None:
    progress.update(stage=stage, percent=percent)


def sanitize_filename(name: str | None, max_len: int = 150) -> str:
    clean = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name or "")
    clean = clean.strip().strip(".") or "audio"
    return clean[:max_len]


def human_size(b: float | int | None) -> str | None:
    if b is None:
        return None
    b = float(b)
    if b >= 1024 ** 3:
        return f"{b / 1024 ** 3:.2f} GB"
    if b >= 1024 ** 2:
        return f"{b / 1024 ** 2:.2f} MB"
    if b >= 1024:
        return f"{b / 1024:.1f} KB"
    return f"{int(b)} B"


def cleanup_old(days: float = 1.0) -> None:
    cutoff = time.time() - days * 86400
    for f in DOWNLOADS_DIR.iterdir():
        try:
            if f.is_file() and f.stat().st_mtime < cutoff:
                f.unlink(missing_ok=True)
        except OSError:
            pass


def cleanup_previews(max_age: float = 12 * 3600) -> None:
    """La vista previa es una caché: no debe crecer sin límite."""
    cutoff = time.time() - max_age
    for f in PREVIEW_DIR.iterdir():
        try:
            if f.is_file() and f.stat().st_mtime < cutoff:
                f.unlink(missing_ok=True)
        except OSError:
            pass



@asynccontextmanager
async def lifespan(_app: FastAPI):
    cleanup_old()
    cleanup_previews()
    yield


app = FastAPI(title="MusicGo API", version=APP_VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Extracción de información
# ---------------------------------------------------------------------------

def base_yt_opts(outtmpl: str, progress_stage: str = "Descargando…", progress_base: int = 10,
                 progress_span: int = 25, task_id: str | None = None) -> dict:
    opts = {
        "format": "bestaudio/best",
        "outtmpl": outtmpl,
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "nocheckcertificate": True,
        # Reintentos nativos de yt-dlp: HTTP, fragmentos HLS y extractores.
        # (El manifest HLS y otros casos los cubre _with_network_retries.)
        "retries": 10,
        "fragment_retries": 10,
        "extractor_retries": 3,
        "file_access_retries": 3,
        "socket_timeout": 20,
        "progress_hooks": [_progress_hook_factory(progress_stage, progress_base, progress_span, task_id)],
    }
    opts.update(YT_CLIENT_OPTS)
    if COOKIES_FILE.exists():
        opts["cookiefile"] = str(COOKIES_FILE)
    return opts


def yt_info_fast(url: str) -> dict | None:
    """Información del video vía yt-dlp (rápida, sin descargar)."""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        **YT_CLIENT_OPTS,
    }
    if COOKIES_FILE.exists():
        opts["cookiefile"] = str(COOKIES_FILE)

    def _run():
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=False)

    try:
        return _with_network_retries(_run, "YouTube")
    except Exception as e:
        if _is_network_error(e):
            raise HTTPException(
                502,
                "Sin conexión con YouTube (error de red). Reintenta en unos segundos.",
            ) from e
        if is_rescuable_block_error(e):
            return None
        return None


def youtube_oembed(url: str) -> dict:
    """Metadatos públicos (título, autor) vía API oEmbed de YouTube (sin API key)."""
    api = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(url, safe="")
    with urllib.request.urlopen(api, timeout=15) as r:
        return json.load(r)


def is_age_gate_error(e: Exception) -> bool:
    msg = str(e).lower()
    keys = (
        "confirm your age",
        "age-restricted",
        "age restricted",
        "sign in to confirm",
        "login required",
        "private video",
    )
    return any(k in msg for k in keys)


def is_premium_block_error(e: Exception) -> bool:
    msg = str(e).lower()
    keys = (
        "music premium",
        "premium members",
        "only available to music premium",
        "join youtube premium",
        "youtube premium",
        "members-only",
        "subscriber-only",
        "membership",
    )
    return any(k in msg for k in keys)


def is_rescuable_block_error(e: Exception) -> bool:
    """Errores que permiten intentar rescate (oEmbed + SoundCloud)."""
    return is_age_gate_error(e) or is_premium_block_error(e)


# Errores de red/transitorios (DNS, timeout, conexión) que vale la pena reintentar.
# Nota: yt-dlp NO reintenta el fetch del manifest HLS (SoundCloud) ni todos los
# errores de extracción, así que los reintentos se hacen aquí.
_NETWORK_MARKERS = (
    "getaddrinfo", "gaierror", "name resolution", "temporary failure in name resolution",
    "timed out", "timeout", "transporterror", "urlopen error",
    "connection refused", "connection reset", "connection aborted", "connection error",
    "cannot connect", "network is unreachable", "no route to host", "max retries exceeded",
    "eof occurred", "http error 429", "http error 5",  # 429 y 5xx = transitorios
)


def _is_network_error(e: Exception) -> bool:
    msg = str(e).lower()
    return any(k in msg for k in _NETWORK_MARKERS)


def _with_network_retries(fn, label: str, percent: int | None = None, attempts: int = 3):
    """Ejecuta fn() reintentando ante errores de red (esperas 2s → 5s → 10s).

    Los errores que no son de red (o tras agotar intentos) se relanzan tal cual.
    """
    waits = (2, 5, 10)
    for i in range(attempts):
        try:
            return fn()
        except HTTPException:
            raise
        except Exception as e:
            if not _is_network_error(e) or i >= attempts - 1:
                raise
            wait = waits[min(i, len(waits) - 1)]
            if percent is not None:
                set_progress(
                    f"⚠️ Fallo de red ({label}). Reintentando {i + 1}/{attempts - 1} en {wait}s…",
                    percent,
                )
            time.sleep(wait)


def build_sc_query(artist: str, title: str) -> str:
    """Construye una búsqueda limpia para SoundCloud: 'Artista Título'."""
    t = title or ""
    # Quitar el prefijo "Artista - ..." si el título lo repite
    t = re.sub(rf"^\s*{re.escape(artist)}[\s\-–—:|•·]*", "", t, flags=re.I)
    # Quitar etiquetas comunes de YouTube: (Official Video), (4K Remaster), [LYRICS]...
    t = re.sub(r"\([^)]*(official|lyric|audio|video|remaster|remix|4k|hd|ft\.?|feat\.?)[^)]*\)", "", t, flags=re.I)
    t = re.sub(r"\[[^\]]*(official|lyric|audio|video|remaster|4k|hd)[^\]]*\]", "", t, flags=re.I)
    t = re.sub(r"\s{2,}", " ", t).strip(" -–—|·")
    query = f"{artist} {t}".strip()
    return query[:120]


def scsearch_first(query: str) -> dict | None:
    """Primer resultado de SoundCloud para una búsqueda («scsearch10:»),
    prefiriendo pistas con duración completa (evita previews de ~30 s)."""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist",
    }
    def _run():
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(f"scsearch10:{query}", download=False)

    try:
        pl = _with_network_retries(_run, "SoundCloud")
    except Exception as e:
        if _is_network_error(e):
            raise HTTPException(
                502,
                "Sin conexión con SoundCloud (error de red). Reintenta en unos segundos.",
            ) from e
        return None
    entries = pl.get("entries") if isinstance(pl, dict) else []
    candidates = []
    for e in entries or []:
        url = e.get("url") or e.get("webpage_url")
        if url:
            candidates.append(e)
    for prefer_full in (True, False):
        for e in candidates:
            dur = e.get("duration")
            if prefer_full and dur is not None and dur < 60:
                continue
            return {
                "url": e.get("url") or e.get("webpage_url"),
                "title": e.get("title"),
                "uploader": e.get("uploader"),
                "duration": dur,
            }
    return None


# ---------------------------------------------------------------------------
# Conversión con ffmpeg
# ---------------------------------------------------------------------------

def download_artwork(url: str | None, uid: str) -> Path | None:
    """Descarga la carátula para incrustarla en el archivo de audio."""
    if not url:
        return None
    dest = DOWNLOADS_DIR / f"{uid}_art.jpg"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=12) as r:
            data = r.read()
        if len(data) < 500:
            return None
        dest.write_bytes(data)
        return dest
    except Exception:
        return None


def audio_codec(src: Path) -> str | None:
    """Codec real de la primera pista de audio (p. ej. 'opus', 'aac', 'mp3').

    Se usa para decidir si basta con copiar el stream (-c:a copy) sin recodificar.
    """
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a:0",
             "-show_entries", "stream=codec_name",
             "-of", "default=noprint_wrappers=1:nokey=1", str(src)],
            capture_output=True, text=True, check=True,
        )
        return (r.stdout or "").strip().lower() or None
    except Exception:
        return None


# Contenedores que admiten carátula adjunta (attached_pic) vía ffmpeg.
# Ogg Opus NO la admite (por eso "opus" queda fuera).
ART_SUPPORTED = ("mp3", "m4a", "flac")


def run_ffmpeg(src: Path, dst: Path, target: str,
               title: str | None = None, artist: str | None = None,
               artwork: Path | None = None, album: str | None = None,
               genre: str | None = None, year: str | None = None,
               track: str | None = None, task_id: str | None = None) -> None:
    codec = audio_codec(src)
    args = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(src)]
    # La carátula solo se adjunta en contenedores que la soportan.
    has_art = artwork is not None and artwork.exists() and target in ART_SUPPORTED
    if has_art:
        args += ["-i", str(artwork)]
    # Solo la pista de audio del origen (+ la carátula como pista adjunta)
    args += ["-map", "0:a"]
    if has_art:
        # Regrabar SIEMPRE la portada a JPEG: MP4/ID3/FLAC no admiten webp, etc.
        # (Es solo la imagen; el audio no se toca.)
        args += ["-map", "1:v", "-c:v", "mjpeg", "-disposition:v", "attached_pic"]

    # --- Elección de códec: copiar siempre que la fuente YA sea el códec destino ---
    if target == "opus":
        # Ogg Opus: -c:a copy SÍ escribe Vorbis Comments y deja el audio bit a bit
        # idéntico a la fuente. (Remux a WebM/.mka perdería los tags; a Ogg no.)
        if codec == "opus":
            args += ["-c:a", "copy", "-f", "ogg"]
        else:
            args += ["-c:a", "libopus", "-b:a", "160k", "-f", "ogg"]
    elif target == "m4a":
        # AAC en MP4/M4A: -c:a copy conserva el stream y sí escribe tags+portada.
        if codec == "aac":
            args += ["-c:a", "copy"]
        else:
            args += ["-c:a", "aac", "-b:a", "320k"]
    elif target == "mp3":
        args += ["-c:a", "libmp3lame", "-b:a", "320k"]   # 320 kbps CBR (máximo)
    elif target == "flac":
        args += ["-c:a", "flac", "-compression_level", "8"]

    tags = {
        "title": title,
        "artist": artist,
        "album": album,
        "genre": genre,
        "date": year,
        "track": track,
    }
    for key, value in tags.items():
        if value not in (None, ""):
            args += ["-metadata", f"{key}={value}"]
    args.append(str(dst))

    # Popen (no run) para poder cancelar una conversión en curso.
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    while proc.poll() is None:
        if task_cancelled(task_id):
            proc.kill()
            proc.wait()
            raise DownloadCancelled()
        time.sleep(0.15)
    err = proc.stderr.read() if proc.stderr else b""
    if proc.stderr:
        proc.stderr.close()
    if proc.returncode != 0:
        raise subprocess.CalledProcessError(proc.returncode, args, output=b"", stderr=err)


def convert(src: Path, target: str, uid: str,
            title: str | None = None, artist: str | None = None,
            artwork: Path | None = None, album: str | None = None,
            genre: str | None = None, year: str | None = None,
            track: str | None = None, task_id: str | None = None) -> Path:
    dst = DOWNLOADS_DIR / f"{uid}{FORMAT_EXT[target]}"
    same_file = src.resolve() == dst.resolve()

    # Copia directa (byte a byte) SOLO si el contenedor de origen ya coincide con el
    # destino y no hay nada que escribir. Nunca recodifica. (Los .webm NO entran aquí:
    # un Opus de YouTube es WebM y debe remuxarse a contenedor Ogg.)
    already = (
        (target == "mp3" and src.suffix.lower() == ".mp3")
        or (target == "flac" and src.suffix.lower() == ".flac")
        or (target == "m4a" and src.suffix.lower() == ".m4a")
        or (target == "opus" and src.suffix.lower() == ".opus")
    )
    has_tags = bool(title or artist or album or genre or year or track)
    if already and not (has_tags or artwork):
        if same_file:
            return src
        shutil.copyfile(src, dst)
        return dst

    # En cualquier otro caso: ffmpeg (con -c:a copy si el códec ya coincide).
    try:
        run_ffmpeg(src, dst, target, title=title, artist=artist, artwork=artwork,
                   album=album, genre=genre, year=year, track=track, task_id=task_id)
        return dst
    except DownloadCancelled:
        raise
    except subprocess.CalledProcessError:
        try:
            # Reintento sin portada (algunos muxers no la soportan)
            run_ffmpeg(src, dst, target, title=title, artist=artist,
                       album=album, genre=genre, year=year, track=track, task_id=task_id)
            return dst
        except DownloadCancelled:
            raise
        except subprocess.CalledProcessError:
            # Recurso final: copia directa del archivo tal cual
            if same_file:
                return src
            shutil.copyfile(src, dst)
            return dst


# ---------------------------------------------------------------------------
# Descarga principal (con flujo de rescate +18)
# ---------------------------------------------------------------------------

def download_source(url: str, task_id: str, force_fallback: bool = False):
    """Devuelve (archivo_descargado, metadatos, info_fallback)."""
    fallback = {"active": False, "located": None}

    if not force_fallback:
        task_update(task_id, stage="Descargando desde YouTube…", percent=10)
        set_progress("Descargando desde YouTube…", 10)

        def _yt_download():
            with yt_dlp.YoutubeDL(base_yt_opts(str(DOWNLOADS_DIR / f"{task_id}_src.%(ext)s"),
                                               task_id=task_id)) as ydl:
                info = ydl.extract_info(url, download=True)
                src = Path(ydl.prepare_filename(info))
                if not src.exists():
                    cands = sorted(DOWNLOADS_DIR.glob(f"{task_id}*.*"))
                    if not cands:
                        raise RuntimeError("No se encontró el archivo descargado")
                    src = cands[0]
                return src, info

        try:
            src, info = _with_network_retries(_yt_download, "YouTube", percent=10)
            meta = {
                "title": info.get("title") or "Audio",
                "artist": info.get("artist") or info.get("uploader") or info.get("channel") or "",
                "webpage_url": url,
                "thumbnail": info.get("thumbnail"),
            }
            # Separar artista/título si YouTube los vino juntos en el título
            raw_title = meta["title"]
            fallback_artist = meta["artist"]
            artist, title = _split_artist_title(raw_title, fallback_artist)
            meta["artist"] = artist
            meta["title"] = title
            return src, meta, fallback
        except DownloadCancelled:
            raise
        except HTTPException:
            raise
        except Exception as e:
            if task_cancelled(task_id):
                raise DownloadCancelled() from e
            if _is_network_error(e):
                raise HTTPException(
                    502,
                    "Sin conexión con YouTube (error de red tras varios intentos). "
                    "Reintenta en unos segundos.",
                ) from e
            if not is_rescuable_block_error(e):
                raise
            set_progress("⚠️ Vídeo bloqueado en YouTube (+18/Premium). Rescatando…", 30)
            task_update(task_id, stage="Rescatando desde SoundCloud…", percent=30)
    else:
        set_progress("Simulando restricción (+18) para pruebas…", 25)

    # ---- FLUJO DE RESCATE ------------------------------------------------
    try:
        oem = _with_network_retries(lambda: youtube_oembed(url), "YouTube")
    except HTTPException:
        raise
    except Exception as e:
        if _is_network_error(e):
            raise HTTPException(
                502,
                "Sin conexión con YouTube (error de red). Reintenta en unos segundos.",
            ) from e
        raise HTTPException(
            403,
            "YouTube bloquea este video y no fue posible rescatar metadatos. "
            "Puede ser privado (requiere cookies.txt) o no estar disponible.",
        )

    title = oem.get("title") or "Audio"
    artist = oem.get("author_name") or "Desconocido"
    query = build_sc_query(artist, title)

    set_progress(f"Buscando «{title}» oficial en SoundCloud…", 45)
    found = scsearch_first(query)
    if not found:
        raise HTTPException(404, f"No se encontró «{title}» de {artist} en SoundCloud para el rescate.")

    set_progress(f"Descargando «{found.get('title', title)}» desde SoundCloud…", 55)
    task_update(task_id, stage=f"Descargando desde SoundCloud…", percent=55)

    def _sc_download():
        with yt_dlp.YoutubeDL(base_yt_opts(str(DOWNLOADS_DIR / f"{task_id}_src.%(ext)s"),
                                            "Descargando desde SoundCloud…", 55, 20, task_id=task_id)) as ydl:
            info = ydl.extract_info(found["url"], download=True)
            src = Path(ydl.prepare_filename(info))
            if not src.exists():
                cands = sorted(DOWNLOADS_DIR.glob(f"{task_id}*.*"))
                if not cands:
                    raise RuntimeError("Fallo la descarga desde SoundCloud")
                src = cands[0]
            return src

    try:
        src = _with_network_retries(_sc_download, "SoundCloud", percent=55)
    except DownloadCancelled:
        raise
    except HTTPException:
        raise
    except Exception as e:
        if task_cancelled(task_id):
            raise DownloadCancelled() from e
        if _is_network_error(e):
            raise HTTPException(
                502,
                "Sin conexión con SoundCloud (error de red tras varios intentos). "
                "Reintenta en unos segundos.",
            ) from e
        raise

    # Separar artista/título también en el resultado de SoundCloud
    sc_title = found.get("title") or title
    sc_artist = found.get("uploader") or artist
    sc_artist, sc_title = _split_artist_title(sc_title, sc_artist)

    fallback = {
        "active": True,
        "located": found.get("url") or "",
        "found_title": sc_title,
        "found_uploader": sc_artist,
    }
    return src, {"title": sc_title, "artist": sc_artist, "webpage_url": found.get("url"),
                 "thumbnail": oem.get("thumbnail_url")}, fallback


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

class InfoRequest(BaseModel):
    url: str


class SearchRequest(BaseModel):
    query: str
    limit: int = 12


class PlaylistRequest(BaseModel):
    url: str


class PreviewRequest(BaseModel):
    url: str


class DownloadRequest(BaseModel):
    url: str
    format: str = "opus"
    filename: str | None = None
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    genre: str | None = None
    year: str | None = None
    track: str | None = None
    task_id: str | None = None
    force_fallback: bool = False


@app.get("/")
def root():
    return {
        "app": "MusicGo API",
        "version": APP_VERSION,
        "endpoints": [
            "/api/info", "/api/download", "/api/progress",
            "/api/search", "/api/playlist", "/api/preview",
            "/api/tasks/{task_id}", "/api/tasks/{task_id}/cancel",
        ],
    }


@app.get("/api/progress")
def api_progress():
    return progress


# ---------------------------------------------------------------------------
# Tareas (progreso por canción + cancelación)
# ---------------------------------------------------------------------------

@app.get("/api/tasks/{task_id}")
def api_task(task_id: str):
    task = TASKS.get(task_id)
    if not task:
        raise HTTPException(404, "Tarea no encontrada.")
    return task


@app.post("/api/tasks/{task_id}/cancel")
def api_task_cancel(task_id: str):
    task = TASKS.get(task_id)
    if not task:
        raise HTTPException(404, "Tarea no encontrada.")
    task["cancel"] = True
    task["stage"] = "Cancelando…"
    return {"ok": True, "task_id": task_id}


# ---------------------------------------------------------------------------
# Búsqueda por nombre y playlists (resultados ligeros, sin descargar)
# ---------------------------------------------------------------------------
_SEARCH_CACHE: dict[str, tuple[float, list[dict]]] = {}
_SEARCH_TTL = 300


def _watch_url(entry: dict) -> str:
    url = entry.get("url") or entry.get("webpage_url")
    if url and str(url).startswith("http"):
        return url
    video_id = entry.get("id")
    return f"https://www.youtube.com/watch?v={video_id}" if video_id else ""


def _thumb_url(entry: dict) -> str | None:
    thumbs = entry.get("thumbnails") or []
    if thumbs:
        return thumbs[-1].get("url")
    if entry.get("thumbnail"):
        return entry["thumbnail"]
    video_id = entry.get("id")
    return f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg" if video_id else None


def _flat_entry(entry: dict) -> dict:
    raw_title = entry.get("title") or "Audio"
    uploader = entry.get("uploader") or entry.get("channel") or ""
    artist, title = _split_artist_title(raw_title, uploader)
    return {
        "id": entry.get("id"),
        "url": _watch_url(entry),
        "title": title,
        "artist": artist,
        "raw_title": raw_title,
        "duration": entry.get("duration"),
        "thumbnail": _thumb_url(entry),
    }


@app.post("/api/search")
def api_search(req: SearchRequest):
    query = (req.query or "").strip()
    if len(query) < 2:
        raise HTTPException(422, "Escribe al menos dos caracteres para buscar.")
    limit = max(1, min(int(req.limit or 12), 20))
    cache_key = f"{query.lower()}:{limit}"
    cached = _SEARCH_CACHE.get(cache_key)
    if cached and time.time() - cached[0] < _SEARCH_TTL:
        return {"query": query, "results": cached[1], "cached": True}

    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist",
        "noplaylist": True,
        **YT_CLIENT_OPTS,
    }
    if COOKIES_FILE.exists():
        opts["cookiefile"] = str(COOKIES_FILE)

    def _run():
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(f"ytsearch{limit}:{query}", download=False)

    try:
        data = _with_network_retries(_run, "YouTube")
    except Exception as e:
        if _is_network_error(e):
            raise HTTPException(502, "Sin conexión con YouTube. Reintenta en unos segundos.") from e
        raise HTTPException(502, "No se pudo buscar en YouTube ahora mismo.") from e

    results = [_flat_entry(e) for e in (data.get("entries") or []) if e]
    _SEARCH_CACHE[cache_key] = (time.time(), results)
    return {"query": query, "results": results, "cached": False}


@app.post("/api/playlist")
def api_playlist(req: PlaylistRequest):
    url = (req.url or "").strip()
    if not url:
        raise HTTPException(422, "Pega el enlace de una playlist.")
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist",
        "noplaylist": False,
        **YT_CLIENT_OPTS,
    }
    if COOKIES_FILE.exists():
        opts["cookiefile"] = str(COOKIES_FILE)

    def _run():
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=False)

    try:
        data = _with_network_retries(_run, "YouTube")
    except Exception as e:
        if _is_network_error(e):
            raise HTTPException(502, "Sin conexión con YouTube. Reintenta en unos segundos.") from e
        raise HTTPException(422, "No se pudo leer la playlist. Verifica el enlace.") from e

    entries = [e for e in (data.get("entries") or []) if e]
    cap = 100
    results = [_flat_entry(e) for e in entries[:cap]]
    return {
        "title": data.get("title") or "Playlist",
        "count": len(entries),
        "truncated": len(entries) > cap,
        "results": results,
    }


# ---------------------------------------------------------------------------
# Vista previa (caché temporal; no toca los archivos finales)
# ---------------------------------------------------------------------------
_PREVIEW_TYPES = {
    ".webm": "audio/webm",
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",
    ".opus": "audio/ogg",
    ".ogg": "audio/ogg",
    ".mp3": "audio/mpeg",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
}


def _preview_key(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:20]


def _preview_path(url: str) -> Path | None:
    for p in PREVIEW_DIR.glob(f"{_preview_key(url)}.*"):
        if p.is_file() and p.suffix.lower() not in {".part", ".ytdl"} and p.stat().st_size > 10_000:
            return p
    return None


def _preview_response(path: Path, cache_state: str) -> FileResponse:
    media = _PREVIEW_TYPES.get(path.suffix.lower()) or mimetypes.guess_type(path.name)[0] or "audio/ogg"
    return FileResponse(
        path,
        media_type=media,
        headers={"Cache-Control": "no-store", "X-MusicGo-Preview": cache_state},
    )


@app.post("/api/preview")
def api_preview(req: PreviewRequest):
    url = (req.url or "").strip()
    if not url:
        raise HTTPException(422, "Falta el enlace para la vista previa.")
    cleanup_previews()

    cached = _preview_path(url)
    if cached:
        return _preview_response(cached, "cache")

    key = _preview_key(url)
    opts = base_yt_opts(str(PREVIEW_DIR / f"{key}.%(ext)s"), "Preparando vista previa…", 0, 100)
    # La vista previa no debe ensuciar el progreso de la cola.
    opts["progress_hooks"] = []

    def _run():
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            path = Path(ydl.prepare_filename(info))
            if not path.exists():
                cands = sorted(PREVIEW_DIR.glob(f"{key}.*"))
                if not cands:
                    raise RuntimeError("No se pudo preparar la vista previa")
                path = cands[0]
            return path

    try:
        path = _with_network_retries(_run, "YouTube")
    except Exception as e:
        if _is_network_error(e):
            raise HTTPException(502, "Sin conexión con YouTube (vista previa).") from e
        raise HTTPException(
            502,
            "No se pudo preparar la vista previa. Puedes descargar directamente.",
        ) from e
    return _preview_response(path, "fresh")


@app.post("/api/info")
def api_info(req: InfoRequest):
    """Analiza el enlace: título, artista, duración y tamaño estimado por formato."""
    info = yt_info_fast(req.url)
    fallback_flag = False
    source = "youtube"

    if info is None:
        try:
            oem = youtube_oembed(req.url)
            raw_title = oem.get("title") or "Audio"
            author = oem.get("author_name") or ""
            artist, title = _split_artist_title(raw_title, author or "Desconocido")
            duration = None
            fallback_flag = True
            source = "soundcloud-probe"
            thumbnail = oem.get("thumbnail_url")
        except HTTPException:
            raise
        except Exception as e:
            if _is_network_error(e):
                raise HTTPException(
                    502,
                    "Sin conexión con YouTube (error de red). Reintenta en unos segundos.",
                ) from e
            raise HTTPException(
                422,
                "No se pudo leer el enlace. Verifica que sea un video de YouTube válido.",
            )
    else:
        raw_title = info.get("title") or "Audio"
        uploader = info.get("uploader") or info.get("channel") or ""
        artist, title = _split_artist_title(raw_title, uploader or "Desconocido")
        duration = info.get("duration")
        thumbnail = info.get("thumbnail")

    # Tamaño real del mejor audio original (OPUS) si el stream lo anuncia
    opus_bytes = None
    opus_estimated = True
    if info:
        best = None
        for f in info.get("formats") or []:
            # Solo audio puro (sin pista de video), para medir el stream de audio real
            if f.get("vcodec") == "none" and f.get("acodec") and f.get("acodec") != "none":
                try:
                    tbr = float(f.get("tbr") or 0)
                except (TypeError, ValueError):
                    tbr = 0.0
                if best is None or tbr > best[0]:
                    best = (tbr, f)
        if best:
            fs = best[1].get("filesize") or best[1].get("filesize_approx")
            if fs:
                opus_bytes = float(fs)
                opus_estimated = False
            elif duration and best[0] > 0:
                opus_bytes = best[0] * 1000 / 8 * duration

    sizes = {
        "opus": {"bytes": opus_bytes, "estimated": opus_estimated, "label": human_size(opus_bytes)},
    }
    for fmt, bps in BPS_ESTIMATE.items():
        est = bps * duration if duration else None
        sizes[fmt] = {"bytes": est, "estimated": True, "label": human_size(est), "duration_known": bool(duration)}

    return {
        "title": title,
        "artist": artist,
        "duration": duration,
        "source": source,
        "fallback": fallback_flag,
        "thumbnail": thumbnail,
        "sizes": sizes,
    }


@app.post("/api/download")
def api_download(req: DownloadRequest):
    fmt = (req.format or "opus").lower()
    if fmt not in FORMATS:
        raise HTTPException(422, f"Formato no soportado: {fmt}. Usa: {', '.join(FORMATS)}")

    # El id lo genera el cliente para poder seguir el progreso y cancelar.
    # Se sanea porque también forma parte de los nombres de archivo temporales.
    clean_id = re.sub(r"[^A-Za-z0-9_-]", "", req.task_id or "")[:32]
    task_id = clean_id or uuid.uuid4().hex[:12]
    TASKS.pop(task_id, None)
    task_create(task_id, title=req.title or "", stage="Iniciando…")
    progress["task_id"] = task_id
    set_progress("Iniciando…", 5)

    src = meta = final = artwork = None
    fallback = {"active": False, "located": None}
    try:
        src, meta, fallback = download_source(req.url, task_id, force_fallback=req.force_fallback)
        task_update(task_id, stage="Convirtiendo audio a " + FORMAT_LABEL[fmt] + "…", percent=85)
        set_progress("Convirtiendo audio a " + FORMAT_LABEL[fmt] + "…", 85)
        # Título y artista: si el usuario los editó, se usan; si no, los del video
        use_artist = req.artist if req.artist is not None else (meta.get("artist") or "")
        use_title = req.title if req.title is not None else (meta.get("title") or "audio")
        artwork = download_artwork(meta.get("thumbnail"), task_id)
        final = convert(
            src, fmt, task_id,
            title=use_title, artist=use_artist, artwork=artwork,
            album=req.album, genre=req.genre, year=req.year, track=req.track,
            task_id=task_id,
        )

        default_name = f"{use_artist} - {use_title}" if use_artist else use_title
        base_name = sanitize_filename(req.filename or default_name)
        out_name = base_name + FORMAT_EXT[fmt]

        headers = {
            "X-MusicGo-Fallback": "1" if fallback.get("active") else "0",
            "X-MusicGo-Source": "soundcloud" if fallback.get("active") else "youtube",
            # Cabeceras HTTP = latin-1: percent-encode cualquier texto con acentos/emojis
            "X-MusicGo-Title": urllib.parse.quote(str(use_title), safe=""),
            "X-MusicGo-Artist": urllib.parse.quote(str(use_artist), safe=""),
            "X-MusicGo-Located": urllib.parse.quote(str(fallback.get("located") or ""), safe=""),
            "X-MusicGo-FoundTitle": urllib.parse.quote(str(fallback.get("found_title") or ""), safe=""),
            "X-MusicGo-SizeBytes": str(final.stat().st_size),
            "X-MusicGo-TaskId": task_id,
        }
        task_update(task_id, status="done", percent=100, stage="Listo")
        set_progress("Listo", 100)

        def _cleanup():
            for p in (final, src, artwork):
                try:
                    if p:
                        p.unlink(missing_ok=True)
                except OSError:
                    pass

        return FileResponse(
            final,
            media_type="application/octet-stream",
            filename=out_name,
            headers=headers,
            background=BackgroundTask(_cleanup),
        )
    except DownloadCancelled:
        task_update(task_id, status="cancelled", stage="Cancelada", error="Cancelada por el usuario")
        raise HTTPException(499, "Descarga cancelada.")
    except HTTPException as e:
        task_update(task_id, status="error", stage="Error", error=str(e.detail))
        raise
    except Exception as e:
        # Fallo de red no cubierto por los reintentos internos → mensaje claro (502)
        if _is_network_error(e):
            task_update(task_id, status="error", stage="Error de red", error="Error de red durante la descarga.")
            raise HTTPException(
                502,
                "Error de red durante la descarga. Reintenta en unos segundos.",
            ) from e
        task_update(task_id, status="error", stage="Error", error=str(e))
        raise
    finally:
        # Si algo falló a mitad de camino, dejar el directorio limpio
        if final is None:
            for f in DOWNLOADS_DIR.glob(f"{task_id}*.*"):
                try:
                    f.unlink(missing_ok=True)
                except OSError:
                    pass