"""MusicGo — Backend.

Servidor FastAPI que:
  - Analiza un enlace de YouTube (título, artista, duración, tamaños estimados).
  - Descarga el audio original (yt-dlp) y lo convierte (ffmpeg) a OPUS/MP3/M4A/FLAC.
  - Detecta restricción de edad (+18) y rescata la pista desde SoundCloud
    (metadatos vía API pública oEmbed de YouTube), con aviso transparente.
  - Soporta cookies opcionales para videos privados vía backend/cookies.txt.
"""

from __future__ import annotations

import json
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
COOKIES_FILE = BASE_DIR / "cookies.txt"
DOWNLOADS_DIR.mkdir(exist_ok=True)

# Clientes de YouTube que evitan muchos bloqueos (incluida parte de la restricción +18)
YT_CLIENT_OPTS = {
    "extractor_args": {"youtube": {"player_client": ["default", "android", "tv"]}}
}

FORMATS = ["opus", "mp3", "m4a", "flac"]
FORMAT_EXT = {"opus": ".opus", "mp3": ".mp3", "m4a": ".m4a", "flac": ".flac"}
FORMAT_LABEL = {
    "opus": "OPUS (original, sin recodificar)",
    "mp3": "MP3 320 kbps (CBR, máximo del MP3)",
    "m4a": "M4A (AAC 320 kbps)",
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

# Progreso global (app local de un solo usuario)
progress = {"task_id": None, "percent": 0, "stage": "inactivo"}


def _progress_hook_factory(stage: str, base_pct: int, span: int):
    """Crea un hook de yt-dlp que actualiza el progreso real de la descarga."""
    def hook(d):
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            if total:
                pct = base_pct + (d.get("downloaded_bytes", 0) / total) * span
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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    cleanup_old()
    yield


app = FastAPI(title="MusicGo API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Extracción de información
# ---------------------------------------------------------------------------

def base_yt_opts(outtmpl: str, progress_stage: str = "Descargando…", progress_base: int = 10, progress_span: int = 25) -> dict:
    opts = {
        "format": "bestaudio/best",
        "outtmpl": outtmpl,
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "nocheckcertificate": True,
        "progress_hooks": [_progress_hook_factory(progress_stage, progress_base, progress_span)],
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
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=False)
    except Exception:
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
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            pl = ydl.extract_info(f"scsearch10:{query}", download=False)
    except Exception:
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


def run_ffmpeg(src: Path, dst: Path, target: str,
               title: str | None = None, artist: str | None = None,
               artwork: Path | None = None) -> None:
    args = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(src)]
    has_art = artwork is not None and artwork.exists()
    if has_art:
        args += ["-i", str(artwork)]
    # Solo la pista de audio del origen (+ la carátula como pista adjunta)
    args += ["-map", "0:a"]
    if has_art:
        args += ["-map", "1:v", "-c:v", "copy", "-disposition:v", "attached_pic"]

    need_recode = bool(title or artist or has_art)

    if target == "opus":
        # Opus en WebM/Matroska: remux puro NO escribe Vorbis Comments.
        # Si hay metadatos o carátula -> recodificar a Opus 160k (calidad YouTube Music).
        if src.suffix.lower() in (".opus", ".webm", ".mkv") and not need_recode:
            args += ["-c:a", "copy"]
        else:
            args += ["-c:a", "libopus", "-b:a", "160k"]
    elif target == "m4a":
        if src.suffix.lower() == ".m4a":
            args += ["-c:a", "copy"]
        else:
            args += ["-c:a", "aac", "-b:a", "320k"]
    elif target == "mp3":
        args += ["-c:a", "libmp3lame", "-b:a", "320k"]   # 320 kbps CBR (máximo)
    elif target == "flac":
        args += ["-c:a", "flac", "-compression_level", "8"]

    if title:
        args += ["-metadata", f"title={title}"]
    if artist:
        args += ["-metadata", f"artist={artist}"]
    args.append(str(dst))
    subprocess.run(args, check=True, capture_output=True)


def convert(src: Path, target: str, uid: str,
            title: str | None = None, artist: str | None = None,
            artwork: Path | None = None) -> Path:
    dst = DOWNLOADS_DIR / f"{uid}{FORMAT_EXT[target]}"
    same_file = src.resolve() == dst.resolve()

    # Si la fuente YA es el formato pedido, copiar (nunca recodificar: mejor calidad)
    already = (
        (target == "mp3" and src.suffix.lower() == ".mp3")
        or (target == "flac" and src.suffix.lower() == ".flac")
        or (target == "m4a" and src.suffix.lower() == ".m4a")
        or (target == "opus" and src.suffix.lower() in (".opus", ".webm"))
    )
    if already and not (title or artist or artwork):
        # Solo copiar si NO hay nada que escribir (metadatos ni portada)
        if same_file:
            return src
        shutil.copyfile(src, dst)
        return dst

    # En cualquier otro caso (formato distinto O hay metadatos/portada): ffmpeg
    try:
        run_ffmpeg(src, dst, target, title=title, artist=artist, artwork=artwork)
        return dst
    except subprocess.CalledProcessError:
        try:
            # Reintento sin portada (algunos muxers no la soportan)
            run_ffmpeg(src, dst, target, title=title, artist=artist)
            return dst
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
        set_progress("Descargando desde YouTube…", 10)
        try:
            with yt_dlp.YoutubeDL(base_yt_opts(str(DOWNLOADS_DIR / f"{task_id}_src.%(ext)s"))) as ydl:
                info = ydl.extract_info(url, download=True)
                src = Path(ydl.prepare_filename(info))
                if not src.exists():
                    cands = sorted(DOWNLOADS_DIR.glob(f"{task_id}*.*"))
                    if not cands:
                        raise RuntimeError("No se encontró el archivo descargado")
                    src = cands[0]
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
        except Exception as e:
            if not is_age_gate_error(e):
                raise
            set_progress("⚠️ YouTube marcó el video como restringido (+18). Rescatando…", 30)
    else:
        set_progress("Simulando restricción (+18) para pruebas…", 25)

    # ---- FLUJO DE RESCATE ------------------------------------------------
    try:
        oem = youtube_oembed(url)
    except Exception:
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
    with yt_dlp.YoutubeDL(base_yt_opts(str(DOWNLOADS_DIR / f"{task_id}_src.%(ext)s"),
                                        "Descargando desde SoundCloud…", 55, 20)) as ydl:
        info = ydl.extract_info(found["url"], download=True)
        src = Path(ydl.prepare_filename(info))
        if not src.exists():
            cands = sorted(DOWNLOADS_DIR.glob(f"{task_id}*.*"))
            if not cands:
                raise RuntimeError("Fallo la descarga desde SoundCloud")
            src = cands[0]

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


class DownloadRequest(BaseModel):
    url: str
    format: str = "opus"
    filename: str | None = None
    title: str | None = None
    artist: str | None = None
    force_fallback: bool = False


@app.get("/")
def root():
    return {"app": "MusicGo API", "version": "0.1.0", "endpoints": ["/api/info", "/api/download", "/api/progress"]}


@app.get("/api/progress")
def api_progress():
    return progress


@app.post("/api/info")
def api_info(req: InfoRequest):
    """Analiza el enlace: título, artista, duración y tamaño estimado por formato."""
    info = yt_info_fast(req.url)
    fallback_flag = False
    source = "youtube"

    if info is None:
        try:
            oem = youtube_oembed(req.url)
            title = oem.get("title") or "Audio"
            artist = oem.get("author_name") or "Desconocido"
            duration = None
            fallback_flag = True
            source = "soundcloud-probe"
            thumbnail = oem.get("thumbnail_url")
        except Exception:
            raise HTTPException(
                422,
                "No se pudo leer el enlace. Verifica que sea un video de YouTube válido.",
            )
    else:
        title = info.get("title") or "Audio"
        artist = info.get("uploader") or info.get("channel") or "Desconocido"
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

    task_id = uuid.uuid4().hex[:12]
    progress["task_id"] = task_id
    set_progress("Iniciando…", 5)

    src = meta = final = artwork = None
    fallback = {"active": False, "located": None}
    try:
        src, meta, fallback = download_source(req.url, task_id, force_fallback=req.force_fallback)
        set_progress("Convirtiendo audio a " + FORMAT_LABEL[fmt] + "…", 85)
        # Título y artista: si el usuario los editó, se usan; si no, los del video
        use_artist = req.artist if req.artist is not None else (meta.get("artist") or "")
        use_title = req.title if req.title is not None else (meta.get("title") or "audio")
        artwork = download_artwork(meta.get("thumbnail"), task_id)
        final = convert(src, fmt, task_id, title=use_title, artist=use_artist, artwork=artwork)

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
        }
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
    finally:
        # Si algo falló a mitad de camino, dejar el directorio limpio
        if final is None:
            for f in DOWNLOADS_DIR.glob(f"{task_id}*.*"):
                try:
                    f.unlink(missing_ok=True)
                except OSError:
                    pass