import { useState, useRef } from "react";
import { getInfo, downloadTrack, getProgress, formatBytes } from "../api.js";

const FORMAT_META = {
  opus: { icon: "bi-music-note-beamed", desc: "Original" },
  mp3: { icon: "bi-volume-up-fill", desc: "320 kbps" },
  m4a: { icon: "bi-headphones", desc: "AAC 320 kbps" },
  flac: { icon: "bi-gem", desc: "Sin pérdida" },
};

const STATUS = {
  idle: "idle",
  analyzing: "analyzing",
  ready: "ready",
  downloading: "downloading",
  success: "success",
  error: "error",
};

export default function DownloadForm() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState(STATUS.idle);
  const [info, setInfo] = useState(null);
  const [format, setFormat] = useState("opus");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [filename, setFilename] = useState("");
  const [progress, setProgress] = useState({ percent: 0, stage: "" });
  const [message, setMessage] = useState(null); // {type, text}
  const [result, setResult] = useState(null); // {fileName, sizeBytes, fallback, located, foundTitle, source}
  const pollTimer = useRef(null);
  const fileNameTouched = useRef(false);

  async function analyze() {
    const trimmed = url.trim();
    if (!trimmed) {
      setMessage({ type: "error", text: "Pega un enlace de YouTube primero." });
      return;
    }
    setStatus(STATUS.analyzing);
    setMessage(null);
    setResult(null);
    try {
      const data = await getInfo(trimmed);
      setInfo(data);
      setFormat(data.sizes?.opus?.bytes ? "opus" : "mp3");
      setTitle(data.title);
      setArtist(data.artist);
      fileNameTouched.current = false;
      setFilename(data.artist ? `${data.artist} - ${data.title}` : data.title);
      setStatus(STATUS.ready);
      if (data.fallback) {
        setMessage({
          type: "fallback",
          text: `Metadatos rescatados vía API pública de YouTube. La pista se obtendrá alternativamente en SoundCloud si YouTube la bloquea (+18).`,
        });
      }
    } catch (err) {
      setStatus(STATUS.idle);
      setMessage({ type: "error", text: err.message });
    }
  }

  function startProgressPolling() {
    stopProgressPolling();
    pollTimer.current = setInterval(async () => {
      try {
        const p = await getProgress();
        setProgress({ percent: p.percent || 0, stage: p.stage || "" });
      } catch {
        /* sin backend: ignorar */
      }
    }, 600);
  }

  function stopProgressPolling() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  async function handleDownload() {
    if (!info) return;
    setStatus(STATUS.downloading);
    setMessage(null);
    setResult(null);
    setProgress({ percent: 5, stage: "Iniciando…" });
    startProgressPolling();
    try {
      const r = await downloadTrack({
        url: url.trim(),
        format,
        filename: filename.trim() || null,
        title,
        artist,
      });
      setResult(r);
      setProgress({ percent: 100, stage: "Listo" });
      setStatus(STATUS.success);
      const target = FORMAT_META[format];
      const noticeText = (
        <>
          <i className="bi bi-check-circle-fill" aria-hidden="true"></i> «{r.fileName}» descargado ·
          tamaño real: {formatBytes(r.sizeBytes)} ·{" "}
          <i className={`bi ${target.icon}`} aria-hidden="true"></i> {target.desc}
        </>
      );
      setMessage({
        type: r.fallback ? "fallback" : "success",
        title: r.fallback
          ? "Restricción de edad (+18) evadida con éxito"
          : undefined,
        text: r.fallback
          ? `MusicGo encontró la canción oficial para descargarla sin requerir inicio de sesión.`
          : noticeText,
        located: r.located,
        foundTitle: r.foundTitle,
      });
    } catch (err) {
      setStatus(STATUS.ready);
      setMessage({ type: "error", text: err.message });
    } finally {
      stopProgressPolling();
    }
  }

  function refreshFilename(newTitle, newArtist) {
    // Si el usuario no tocó el nombre a mano, se actualiza solo con Artista - Título
    if (fileNameTouched.current) return;
    const t = newTitle || "";
    const a = newArtist || "";
    setFilename(a ? `${a} - ${t}` : t);
  }

  function handleFilenameChange(e) {
    fileNameTouched.current = true;
    setFilename(e.target.value);
  }

  function reset() {
    stopProgressPolling();
    setStatus(STATUS.idle);
    setInfo(null);
    setMessage(null);
    setResult(null);
    setProgress({ percent: 0, stage: "" });
    fileNameTouched.current = false;
  }

  const analyzing = status === STATUS.analyzing;
  const downloading = status === STATUS.downloading;
  const busy = analyzing || downloading;

  return (
    <section className="card glass" aria-label="Descargar música">
      <div className="input-row">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && status !== STATUS.analyzing && analyze()}
          placeholder="Pega el enlace de YouTube…"
          aria-label="Enlace de YouTube"
          disabled={busy}
        />
        {status !== STATUS.ready ? (
          <button className="btn" onClick={analyze} disabled={busy}>
            {analyzing ? (
              <>
                <span className="spinner" /> Analizando
              </>
            ) : (
              "Buscar"
            )}
          </button>
        ) : (
          <button className="btn btn-ghost" onClick={reset}>
            <i className="bi bi-arrow-counterclockwise" aria-hidden="true"></i> Nuevo
          </button>
        )}
      </div>

      {info && status !== STATUS.idle && (
        <div className="track">
          <div className="track-head">
            {info.thumbnail && (
              <img className="thumb" src={info.thumbnail} alt="" loading="lazy" />
            )}
            <div>
              <h2 className="track-title">{info.title}</h2>
              <p className="track-meta">
                <b>{info.artist}</b>
                {info.duration
                  ? ` · ${formatDuration(info.duration)} de duración`
                  : " · duración desconocida"}
              </p>
            </div>
          </div>

          <label className="field-label" htmlFor="audio-title">
            Título (se graba dentro del archivo)
          </label>
          <input
            id="audio-title"
            className="name-input"
            value={title}
            onChange={(e) => {
              const v = e.target.value;
              setTitle(v);
              refreshFilename(v, artist);
            }}
            disabled={downloading}
            placeholder="Sin título"
          />

          <label className="field-label" htmlFor="audio-artist">
            Artista
          </label>
          <input
            id="audio-artist"
            className="name-input"
            value={artist}
            onChange={(e) => {
              const v = e.target.value;
              setArtist(v);
              refreshFilename(title, v);
            }}
            disabled={downloading}
            placeholder="Artista desconocido"
          />

          <label className="field-label" htmlFor="filename">
            Nombre del archivo (editable)
          </label>
          <input
            id="filename"
            className="name-input"
            value={filename}
            onChange={handleFilenameChange}
            disabled={downloading}
          />

          <label className="field-label">Formato y tamaño estimado</label>
          <div className="formats" role="radiogroup" aria-label="Elegir formato">
            {Object.entries(FORMAT_META).map(([key, meta]) => {
              const size = info.sizes?.[key];
              const selected = format === key;
              return (
                <label
                  key={key}
                  className={`format ${selected ? "selected" : ""}`}
                  role="radio"
                  aria-checked={selected}
                >
                  <input
                    type="radio"
                    name="format"
                    value={key}
                    checked={selected}
                    onChange={() => setFormat(key)}
                    disabled={downloading}
                  />
                  <span className="f-name">
                    <i className={`bi ${meta.icon}`} aria-hidden="true"></i> {key.toUpperCase()}
                  </span>
                  <span className="f-size">
                    ≈ {size?.label ? size.label : "calculando…"}
                    {size?.estimated && size.label ? <small> est.</small> : null}
                  </span>
                  <span className="f-desc">{meta.desc}</span>
                </label>
              );
            })}
          </div>

          {!info.fallback && info.sizes?.opus?.bytes == null && (
            <p className="track-meta" style={{ marginTop: 10 }}>
              El tamaño de OPUS se muestra como estimado porque el stream no lo anuncia;
              los demás formatos se calculan con la duración exacta.
            </p>
          )}

          <div style={{ marginTop: 22 }}>
            <button className="btn btn-full" onClick={handleDownload} disabled={downloading}>
              {downloading ? (
                <>
                  <span className="spinner" /> Descargando…
                </>
              ) : (
                `Descargar en ${format.toUpperCase()}`
              )}
            </button>
          </div>

          {(downloading || status === STATUS.success) && progress.percent > 0 && (
            <div className="progress-wrap">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
              </div>
              <p className="progress-stage">{progress.stage}</p>
            </div>
          )}

          {message && (
            <div className={`notice ${message.type}`}>
              {message.title ? <strong>{message.title}</strong> : null}
              {message.text}
              {message.located ? (
                <div className="muted-line">
                  Fuente alternativa localizada:{" "}
                  <a href={message.located} target="_blank" rel="noreferrer">
                    {message.foundTitle || "abrir enlace"}
                  </a>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}