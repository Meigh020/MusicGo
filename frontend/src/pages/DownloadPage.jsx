import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cancelTask, downloadTrack, getInfo, getTask, searchYouTube } from "../api.js";
import { FORMATS, FORMAT_KEYS } from "../formats.js";
import { composeFilename, formatBytes, formatDuration, looksLikeUrl, makeId } from "../utils.js";
import { useLibrary } from "../context/LibraryContext.jsx";
import { usePlayer } from "../context/PlayerContext.jsx";
import { useQueue } from "../context/QueueContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import Module, { Rail } from "../components/Module.jsx";

const EMPTY_FIELDS = { title: "", artist: "", album: "", genre: "", year: "", track: "" };

export default function DownloadPage() {
  const { push } = useToast();
  const { add: addToLibrary, stats, entries: libraryEntries } = useLibrary();
  const player = usePlayer();
  const queue = useQueue();

  const [mode, setMode] = useState("search");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [searchError, setSearchError] = useState("");

  const [selected, setSelected] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [filename, setFilename] = useState("");
  const [fileNameTouched, setFileNameTouched] = useState(false);
  const [format, setFormat] = useState("opus");

  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [result, setResult] = useState(null);
  const cancelledRef = useRef(false);
  const taskRef = useRef(null);

  // Progreso en tiempo real de la descarga simple.
  useEffect(() => {
    if (!downloading) return undefined;
    const timer = setInterval(async () => {
      const task = await getTask(taskRef.current);
      if (!task) return;
      setProgress(task.percent || 0);
      setStage(task.stage || "");
    }, 500);
    return () => clearInterval(timer);
  }, [downloading]);

  const activePreviewKey = `${selected?.url || ""}|preview`;
  const isPreviewing = player.current?.key === activePreviewKey;

  async function runSearch(event) {
    event?.preventDefault();
    const value = query.trim();
    if (!value) {
      setSearchError("Escribe una canción o un artista.");
      return;
    }
    if (looksLikeUrl(value)) {
      analyzeUrl(value);
      return;
    }
    setSearching(true);
    setSearchError("");
    setResults([]);
    setResult(null);
    try {
      const data = await searchYouTube(value, 12);
      setResults(data.results || []);
      if (!data.results?.length) {
        setSearchError("YouTube no devolvió resultados. Prueba con otras palabras.");
      }
    } catch (err) {
      setSearchError(err.message || "No se pudo buscar.");
    } finally {
      setSearching(false);
    }
  }

  async function analyzeUrl(url) {
    const value = (url || "").trim();
    if (!value) return;
    setAnalyzing(true);
    setAnalyzeError("");
    setDownloadError("");
    setResult(null);
    try {
      const data = await getInfo(value);
      setSelected({ url: value, ...data });
      setFields({
        title: data.title || "",
        artist: data.artist || "",
        album: "",
        genre: "",
        year: "",
        track: "",
      });
      setFilename(composeFilename(data.title, data.artist));
      setFileNameTouched(false);
      setFormat("opus");
      setProgress(0);
      setStage("");
      if (data.fallback) {
        push("Metadatos recuperados vía oEmbed. Si YouTube bloquea la pista, se rescatará desde SoundCloud.", {
          type: "info",
          ms: 8000,
        });
      }
    } catch (err) {
      setAnalyzeError(err.message || "No se pudo analizar el enlace.");
      setSelected(null);
    } finally {
      setAnalyzing(false);
    }
  }

  function updateField(key, value) {
    const next = { ...fields, [key]: value };
    setFields(next);
    if (!fileNameTouched && (key === "title" || key === "artist")) {
      setFilename(composeFilename(next.title, next.artist));
    }
  }

  async function startDownload() {
    if (!selected || downloading) return;
    const taskId = makeId();
    taskRef.current = taskId;
    cancelledRef.current = false;
    setDownloading(true);
    setDownloadError("");
    setResult(null);
    setProgress(4);
    setStage("Iniciando…");

    try {
      const response = await downloadTrack({
        url: selected.url,
        format,
        filename: filename.trim() || null,
        title: fields.title,
        artist: fields.artist,
        album: fields.album,
        genre: fields.genre,
        year: fields.year,
        track: fields.track,
        taskId,
      });
      setResult(response);
      setProgress(100);
      setStage("Listo");
      addToLibrary({
        url: selected.url,
        title: fields.title || "Audio",
        artist: fields.artist || "",
        album: fields.album || "",
        genre: fields.genre || "",
        year: fields.year || "",
        track: fields.track || "",
        format,
        sizeBytes: response.sizeBytes,
        fileName: response.fileName,
        fallback: !!response.fallback,
        source: response.source,
        thumbnail: selected.thumbnail || "",
      });
      push(`«${response.fileName}» guardada · ${formatBytes(response.sizeBytes)}`, {
        type: response.fallback ? "info" : "ok",
        ms: 9000,
        action: {
          label: "REPRODUCIR",
          onClick: () =>
            player.playDownloaded(response.blob, {
              url: selected.url,
              title: fields.title,
              artist: fields.artist,
              thumbnail: selected.thumbnail,
            }),
        },
      });
    } catch (err) {
      const cancelled = cancelledRef.current || err.status === 499 || /cancel/i.test(err.message || "");
      setDownloadError(cancelled ? "Descarga cancelada." : err.message || "La descarga falló.");
      setProgress(0);
      setStage("");
    } finally {
      setDownloading(false);
    }
  }

  async function cancelDownload() {
    if (!taskRef.current) return;
    cancelledRef.current = true;
    try {
      await cancelTask(taskRef.current);
    } catch {
      /* la petición de descarga también fallará */
    }
  }

  function reset() {
    setSelected(null);
    setFields(EMPTY_FIELDS);
    setFilename("");
    setFormat("opus");
    setResult(null);
    setDownloadError("");
    setProgress(0);
    setStage("");
  }

  function addSelectedToQueue() {
    if (!selected) return;
    queue.addEntries([
      {
        url: selected.url,
        title: fields.title,
        artist: fields.artist,
        duration: selected.duration,
        thumbnail: selected.thumbnail,
      },
    ]);
  }

  const size = selected?.sizes?.[format];
  const sizeLabel = size?.label || "—";
  const selectedMeta = FORMATS[format];

  return (
    <div className="board">
      <section className="mast">
        <div className="mast-copy">
          <h1>
            El original manda<span className="accent">.</span>
          </h1>
          <p>
            Busca o pega un enlace. MusicGo conserva el Opus original cuando eliges OPUS:
            sin recodificar, con sus tags y carátula cuando el contenedor lo admite.
          </p>
          <div className="mast-foot">
            <span className="mast-rule" aria-hidden="true" />
            Archivo local de audio · YouTube → Ogg Opus
          </div>
        </div>
        <div className="mast-stats">
          <div className="stat">
            <b>{String(stats.count).padStart(2, "0")}</b>
            <span>Archivadas</span>
          </div>
          <div className="stat">
            <b>{String(queue.pendingCount).padStart(2, "0")}</b>
            <span>En cola</span>
          </div>
          <div className="stat">
            <b>{stats.totalBytes ? formatBytes(stats.totalBytes) : "0 B"}</b>
            <span>En disco</span>
          </div>
        </div>
      </section>

      <div className="grid">
        <Module
          id="01"
          title="Entrada"
          className="span-7"
          right={
            <div className="seg" role="tablist" aria-label="Tipo de entrada">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "search"}
                className={mode === "search" ? "active" : ""}
                onClick={() => setMode("search")}
              >
                Buscar
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "link"}
                className={mode === "link" ? "active" : ""}
                onClick={() => setMode("link")}
              >
                Enlace
              </button>
            </div>
          }
        >
          <form className="searchbar" onSubmit={runSearch}>
            <label className="sr-only" htmlFor="search-input">
              {mode === "search" ? "Buscar una canción en YouTube" : "Enlace de YouTube"}
            </label>
            <input
              id="search-input"
              className="field"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                mode === "search"
                  ? "Artista, canción o «artista - canción»…"
                  : "https://www.youtube.com/watch?v=…"
              }
              autoComplete="off"
              spellCheck="false"
            />
            <button className="btn btn-primary" type="submit" disabled={searching || analyzing}>
              {searching ? <span className="spin" aria-hidden="true" /> : <i className="bi bi-search" aria-hidden="true" />}
              {mode === "search" ? "Buscar" : "Analizar"}
            </button>
          </form>

          <div className="hintline">
            <span>
              <b>{results.length}</b> resultados · pega también playlists en la cola
            </span>
            <Link to="/cola">Ir a la cola <i className="bi bi-arrow-right" aria-hidden="true" /></Link>
          </div>

          {searchError ? <p className="note error">{searchError}</p> : null}

          {searching || analyzing ? (
            <div className="skeleton-list" aria-hidden="true">
              {[0, 1, 2, 3].map((row) => (
                <div className="skeleton-row" key={row}>
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : results.length > 0 ? (
            <ol className="results">
              {results.map((item, index) => {
                const previewKey = `${item.url}|preview`;
                const playing = player.current?.key === previewKey && player.playing;
                const active = selected?.url === item.url;
                return (
                  <li key={`${item.id || item.url}-${index}`} className={`result ${active ? "active" : ""}`}>
                    <span className="r-idx">{String(index + 1).padStart(2, "0")}</span>
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt="" loading="lazy" />
                    ) : (
                      <span className="r-thumb-empty" aria-hidden="true">
                        <i className="bi bi-music-note" />
                      </span>
                    )}
                    <button type="button" className="r-main" onClick={() => analyzeUrl(item.url)}>
                      <b>{item.title}</b>
                      <span>
                        {item.artist || "Artista desconocido"}
                        {item.duration ? ` · ${formatDuration(item.duration)}` : ""}
                        {active ? " · seleccionada" : ""}
                      </span>
                    </button>
                    <div className="r-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title={playing ? "Pausar vista previa" : "Escuchar vista previa"}
                        aria-label={playing ? "Pausar vista previa" : "Escuchar vista previa"}
                        onClick={() => player.playPreview(item)}
                      >
                        <i className={`bi ${playing ? "bi-pause-fill" : "bi-play-fill"}`} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn red"
                        title="Usar esta pista"
                        aria-label="Usar esta pista"
                        onClick={() => analyzeUrl(item.url)}
                      >
                        <i className="bi bi-arrow-down-right" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <ol className="steps">
              <li>
                <span>01</span>
                <div>
                  <b>Pega un enlace o busca por nombre</b>
                  <p>También acepta una URL de playlist: la cola la expande entera.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <b>Revisa los tags antes de descargar</b>
                  <p>Título, artista, álbum, año, género y número de pista se escriben en el archivo.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <b>Elige el formato honesto</b>
                  <p>OPUS conserva el original; MP3, M4A y FLAC son conversiones de compatibilidad.</p>
                </div>
              </li>
            </ol>
          )}
        </Module>

        <Module
          id="02"
          title="Ficha"
          className="span-5"
          right={
            selected ? (
              <span className={`tag ${selected.fallback ? "tag-warn" : "tag-ghost"}`}>
                {selected.fallback ? "RESCATE" : selected.source === "youtube" ? "YOUTUBE" : "LOCAL"}
              </span>
            ) : null
          }
        >
          {analyzing ? (
            <div className="analyzing" role="status">
              <span className="spin dark" aria-hidden="true" />
              <div>
                <b>Analizando la pista…</b>
                <span>Consultando título, duración y tamaños.</span>
              </div>
            </div>
          ) : !selected ? (
            <div className="empty">
              <i className="bi bi-disc" aria-hidden="true" />
              <b>Sin pista seleccionada</b>
              <p>Busca arriba o pega un enlace para abrir su ficha.</p>
            </div>
          ) : (
            <>
              <div className="ficha-top">
                {selected.thumbnail ? (
                  <img className="ficha-thumb" src={selected.thumbnail} alt="" />
                ) : (
                  <span className="ficha-thumb ficha-thumb-empty" aria-hidden="true">
                    <i className="bi bi-music-note" />
                  </span>
                )}
                <div className="ficha-id">
                  <h3>{fields.title || selected.title}</h3>
                  <p>{fields.artist || "Artista desconocido"}</p>
                  <span>
                    {formatDuration(selected.duration)} ·{" "}
                    {size ? `≈ ${sizeLabel}` : "tamaño por calcular"}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  title={isPreviewing && player.playing ? "Pausar vista previa" : "Escuchar vista previa"}
                  aria-label={isPreviewing && player.playing ? "Pausar vista previa" : "Escuchar vista previa"}
                  onClick={() =>
                    player.playPreview({
                      url: selected.url,
                      title: fields.title,
                      artist: fields.artist,
                      thumbnail: selected.thumbnail,
                      duration: selected.duration,
                    })
                  }
                >
                  <i
                    className={`bi ${isPreviewing && player.playing ? "bi-pause-fill" : "bi-play-fill"}`}
                    aria-hidden="true"
                  />
                </button>
              </div>

              {selected.fallback ? (
                <p className="note warn">
                  <i className="bi bi-lightning-charge" aria-hidden="true" /> YouTube bloquea esta pista:
                  el audio se buscará en SoundCloud. La ficha usa los metadatos públicos del vídeo.
                </p>
              ) : null}

              {analyzeError ? <p className="note error">{analyzeError}</p> : null}

              <div className="fields">
                <div className="field-full">
                  <label className="lbl" htmlFor="f-title">
                    Título
                  </label>
                  <input
                    id="f-title"
                    className="field"
                    value={fields.title}
                    onChange={(event) => updateField("title", event.target.value)}
                    disabled={downloading}
                  />
                </div>
                <div>
                  <label className="lbl" htmlFor="f-artist">
                    Artista
                  </label>
                  <input
                    id="f-artist"
                    className="field"
                    value={fields.artist}
                    onChange={(event) => updateField("artist", event.target.value)}
                    disabled={downloading}
                  />
                </div>
                <div>
                  <label className="lbl" htmlFor="f-album">
                    Álbum
                  </label>
                  <input
                    id="f-album"
                    className="field"
                    value={fields.album}
                    onChange={(event) => updateField("album", event.target.value)}
                    disabled={downloading}
                    placeholder="Opcional"
                  />
                </div>
                <div className="field-3">
                  <div>
                    <label className="lbl" htmlFor="f-year">
                      Año
                    </label>
                    <input
                      id="f-year"
                      className="field"
                      value={fields.year}
                      onChange={(event) => updateField("year", event.target.value)}
                      disabled={downloading}
                      placeholder="2026"
                    />
                  </div>
                  <div>
                    <label className="lbl" htmlFor="f-genre">
                      Género
                    </label>
                    <input
                      id="f-genre"
                      className="field"
                      value={fields.genre}
                      onChange={(event) => updateField("genre", event.target.value)}
                      disabled={downloading}
                      placeholder="Pop"
                    />
                  </div>
                  <div>
                    <label className="lbl" htmlFor="f-track">
                      Pista
                    </label>
                    <input
                      id="f-track"
                      className="field"
                      value={fields.track}
                      onChange={(event) => updateField("track", event.target.value)}
                      disabled={downloading}
                      placeholder="1"
                    />
                  </div>
                </div>
                <div className="field-full">
                  <label className="lbl" htmlFor="f-file">
                    Nombre del archivo
                  </label>
                  <div className="file-row">
                    <input
                      id="f-file"
                      className="field"
                      value={filename}
                      onChange={(event) => {
                        setFileNameTouched(true);
                        setFilename(event.target.value);
                      }}
                      disabled={downloading}
                    />
                    <span className="ext">.{selectedMeta.ext}</span>
                  </div>
                </div>
              </div>

              <div className="fmt-grid" role="radiogroup" aria-label="Formato de descarga">
                {FORMAT_KEYS.map((key) => {
                  const meta = FORMATS[key];
                  const fmtSize = selected.sizes?.[key];
                  const active = format === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`fmt ${active ? "sel" : ""}`}
                      onClick={() => setFormat(key)}
                      disabled={downloading}
                    >
                      <span className="fmt-code">
                        <i className={`bi ${meta.icon}`} aria-hidden="true" /> {meta.label}
                      </span>
                      <span className="fmt-size">
                        {fmtSize?.label || "—"}
                        {fmtSize?.estimated && fmtSize?.label ? <em> est.</em> : null}
                      </span>
                      <span className="fmt-method">{meta.method}</span>
                    </button>
                  );
                })}
              </div>

              <p className={`quality ${format}`}>
                <i className="bi bi-info-circle" aria-hidden="true" /> {selectedMeta.note}
              </p>

              {downloading ? (
                <div className="progress-block">
                  <Rail percent={progress} label="Progreso de la descarga" />
                  <div className="progress-line">
                    <span>{stage || "Trabajando…"}</span>
                    <b>{progress}%</b>
                  </div>
                </div>
              ) : null}

              {downloadError ? <p className="note error">{downloadError}</p> : null}

              {result ? (
                <div className="result-ok">
                  <div>
                    <span className="tag tag-done">ARCHIVADA</span>
                    <b>{formatBytes(result.sizeBytes)}</b>
                    {result.fallback ? <span className="tag tag-warn">SOUNDCLOUD</span> : null}
                  </div>
                  <div className="result-ok-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        player.playDownloaded(result.blob, {
                          url: selected.url,
                          title: fields.title,
                          artist: fields.artist,
                          thumbnail: selected.thumbnail,
                        })
                      }
                    >
                      <i className="bi bi-play-fill" aria-hidden="true" /> Reproducir
                    </button>
                    <Link className="btn btn-ghost btn-sm" to="/biblioteca">
                      Biblioteca
                    </Link>
                  </div>
                </div>
              ) : null}

              <div className="ficha-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  onClick={startDownload}
                  disabled={downloading}
                >
                  {downloading ? (
                    <>
                      <span className="spin" aria-hidden="true" /> Descargando
                    </>
                  ) : (
                    <>
                      <i className="bi bi-download" aria-hidden="true" /> Descargar {selectedMeta.label} · {sizeLabel}
                    </>
                  )}
                </button>
                {downloading ? (
                  <button type="button" className="btn btn-ghost" onClick={cancelDownload}>
                    Cancelar
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost" onClick={addSelectedToQueue}>
                    <i className="bi bi-plus-lg" aria-hidden="true" /> A la cola
                  </button>
                )}
              </div>

              <div className="ficha-foot">
                <button type="button" className="linkbtn" onClick={reset}>
                  Nueva búsqueda
                </button>
                {selected.sizes?.opus?.bytes == null && !selected.fallback ? (
                  <span>El tamaño de OPUS es estimado: el stream no lo anuncia.</span>
                ) : null}
              </div>
            </>
          )}
        </Module>

        <Module id="03" title="Calidad" className="span-4">
          <table className="table dense">
            <thead>
              <tr>
                <th>Formato</th>
                <th>Método</th>
              </tr>
            </thead>
            <tbody>
              {FORMAT_KEYS.map((key) => (
                <tr key={key} className={key === "opus" ? "hl" : ""}>
                  <td>
                    <b>{FORMATS[key].label}</b>
                  </td>
                  <td>{FORMATS[key].method}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note quiet">
            La calidad la pone la fuente. Recodificar nunca mejora el sonido: OPUS es el original;
            FLAC desde YouTube no es un FLAC real.
          </p>
        </Module>

        <Module
          id="04"
          title="Cola"
          className="span-8"
          right={
            <Link className="mod-link" to="/cola">
              Ver cola {queue.items.length > 0 ? `(${queue.items.length})` : ""}
            </Link>
          }
        >
          {queue.items.length === 0 ? (
            <p className="empty-inline">
              La cola está vacía. Pega varias URLs o una playlist para descargar en lote.
            </p>
          ) : (
            <ul className="mini-queue">
              {queue.items.slice(0, 4).map((item, index) => (
                <li key={item.id} className={`mini-q ${item.status}`}>
                  <span className="r-idx">{String(index + 1).padStart(2, "0")}</span>
                  {item.info?.thumbnail ? (
                    <img src={item.info.thumbnail} alt="" loading="lazy" />
                  ) : (
                    <span className="r-thumb-empty" aria-hidden="true">
                      <i className="bi bi-music-note" />
                    </span>
                  )}
                  <div className="mini-q-main">
                    <b>{item.title || item.filename || "Analizando…"}</b>
                    <span>
                      {item.artist || "Artista desconocido"} · {FORMATS[item.format]?.label}
                    </span>
                  </div>
                  <span className={`tag ${statusTag(item.status)}`}>{statusLabel(item.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </Module>

        {libraryEntries.length > 0 ? (
          <Module
            id="05"
            title="Recientes"
            className="span-12"
            right={
              <Link className="mod-link" to="/biblioteca">
                Abrir biblioteca
              </Link>
            }
          >
            <ul className="recent">
              {libraryEntries.slice(0, 4).map((entry) => {
                const previewKey = `${entry.url}|preview`;
                const playing = player.current?.key === previewKey && player.playing;
                return (
                  <li className="recent-item" key={entry.id}>
                    {entry.thumbnail ? (
                      <img src={entry.thumbnail} alt="" loading="lazy" />
                    ) : (
                      <span className="r-thumb-empty" aria-hidden="true">
                        <i className="bi bi-music-note" />
                      </span>
                    )}
                    <div className="recent-main">
                      <b title={entry.title}>{entry.title}</b>
                      <span>
                        {entry.artist || "Artista desconocido"} ·{" "}
                        {FORMATS[entry.format]?.label || entry.format} ·{" "}
                        {formatBytes(entry.sizeBytes)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="icon-btn red"
                      aria-label={playing ? "Pausar vista previa" : "Escuchar vista previa"}
                      title={playing ? "Pausar vista previa" : "Escuchar vista previa"}
                      onClick={() =>
                        player.playPreview({
                          url: entry.url,
                          title: entry.title,
                          artist: entry.artist,
                          thumbnail: entry.thumbnail,
                        })
                      }
                    >
                      <i className={`bi ${playing ? "bi-pause-fill" : "bi-play-fill"}`} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Module>
        ) : null}
      </div>
    </div>
  );
}

function statusLabel(status) {
  return (
    {
      analyzing: "ANALIZANDO",
      pending: "PENDIENTE",
      downloading: "ACTIVA",
      done: "HECHA",
      error: "ERROR",
    }[status] || status.toUpperCase()
  );
}

function statusTag(status) {
  return (
    {
      analyzing: "tag-ghost",
      pending: "tag-pending",
      downloading: "tag-live",
      done: "tag-done",
      error: "tag-error",
    }[status] || "tag-ghost"
  );
}
