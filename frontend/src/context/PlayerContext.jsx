import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getPreviewBlob } from "../api.js";
import { formatClock } from "../utils.js";
import { useToast } from "./ToastContext.jsx";

const PlayerContext = createContext(null);
const VOLUME_KEY = "musicgo-volume";

export function PlayerProvider({ children }) {
  const { push } = useToast();
  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);
  const [current, setCurrent] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(VOLUME_KEY));
      return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.85;
    } catch {
      return 0.85;
    }
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      /* sin almacenamiento */
    }
  }, [volume]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const startBlob = useCallback((blob, meta, source) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;
    setCurrent({
      key: `${meta.url || meta.title}|${source}`,
      title: meta.title || "Audio",
      artist: meta.artist || "",
      thumbnail: meta.thumbnail || "",
      source,
    });
    setTime(0);
    setDuration(meta.duration || 0);
    audio.src = url;
    audio.load();
    const promise = audio.play();
    if (promise) {
      promise.then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }, []);

  const playPreview = useCallback(
    async (track) => {
      if (!track?.url) return;
      const key = `${track.url}|preview`;
      if (current?.key === key) {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) {
          audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
        } else {
          audio.pause();
        }
        return;
      }
      setLoading(true);
      try {
        const { blob } = await getPreviewBlob(track.url);
        startBlob(blob, track, "preview");
      } catch (err) {
        push(err.message || "No se pudo preparar la vista previa.", { type: "error", ms: 8000 });
      } finally {
        setLoading(false);
      }
    },
    [current, push, startBlob]
  );

  const playDownloaded = useCallback(
    (blob, meta) => startBlob(blob, meta, "download"),
    [startBlob]
  );

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (audio.paused) play();
    else pause();
  }, [pause, play]);

  const seek = useCallback((seconds) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(seconds, audio.duration || 0));
    setTime(audio.currentTime);
  }, []);

  const close = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setCurrent(null);
    setPlaying(false);
    setTime(0);
    setDuration(0);
  }, []);

  const value = useMemo(
    () => ({
      current,
      playing,
      loading,
      time,
      duration,
      volume,
      setVolume,
      playPreview,
      playDownloaded,
      toggle,
      pause,
      seek,
      close,
    }),
    [close, current, duration, loading, pause, playDownloaded, playPreview, playing, seek, time, toggle, volume]
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
        }}
      />
      {current ? <MiniPlayer /> : null}
    </PlayerContext.Provider>
  );
}

function MiniPlayer() {
  const { current, playing, loading, time, duration, volume, setVolume, toggle, seek, close } =
    useContext(PlayerContext);
  const percent = duration > 0 ? (time / duration) * 100 : 0;

  return (
    <div className="player" role="region" aria-label="Reproductor">
      <div className="player-inner">
        <div className="player-track">
          {current.thumbnail ? (
            <img className="player-thumb" src={current.thumbnail} alt="" />
          ) : (
            <span className="player-thumb player-thumb-empty" aria-hidden="true">
              <i className="bi bi-music-note" />
            </span>
          )}
          <div className="player-meta">
            <b className="player-title" title={current.title}>
              {current.title}
            </b>
            <span className="player-artist" title={current.artist}>
              {current.artist || "Artista desconocido"}
            </span>
          </div>
          <span className={`player-src ${current.source}`}>
            {current.source === "preview" ? "PREVIEW" : "ARCHIVO"}
          </span>
        </div>

        <div className="player-center">
          <button
            type="button"
            className="player-play"
            onClick={toggle}
            aria-label={playing ? "Pausar" : "Reproducir"}
          >
            <i className={`bi ${loading ? "bi-hourglass-split" : playing ? "bi-pause-fill" : "bi-play-fill"}`} aria-hidden="true" />
          </button>
          <span className="player-time">{formatClock(time)}</span>
          <input
            className="player-seek"
            type="range"
            min="0"
            max={duration || 1}
            step="0.1"
            value={time}
            onChange={(e) => seek(Number(e.target.value))}
            style={{ "--pct": `${percent}%` }}
            aria-label="Posición de reproducción"
          />
          <span className="player-time">{formatClock(duration)}</span>
        </div>

        <div className="player-right">
          <i className="bi bi-volume-up" aria-hidden="true" />
          <input
            className="player-vol"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{ "--pct": `${volume * 100}%` }}
            aria-label="Volumen"
          />
          <button type="button" className="icon-btn" onClick={close} aria-label="Cerrar reproductor">
            <i className="bi bi-x" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer debe usarse dentro de PlayerProvider");
  return ctx;
}
