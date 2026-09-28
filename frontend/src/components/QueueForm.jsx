import { useEffect, useRef, useState } from "react";
import { getInfo, downloadTrack, getProgress, formatBytes } from "../api.js";

// Formato por ítem (mismos que en el modo Simple)
const FORMAT_META = {
  opus: { icon: "bi-music-note-beamed", label: "OPUS", desc: "Original, sin recodificar", ext: "opus" },
  mp3: { icon: "bi-volume-up-fill", label: "MP3", desc: "320 kbps CBR", ext: "mp3" },
  m4a: { icon: "bi-headphones", label: "M4A", desc: "AAC 320 kbps", ext: "m4a" },
  flac: { icon: "bi-gem", label: "FLAC", desc: "Sin pérdida", ext: "flac" },
};

const STORAGE_KEY = "musicgo-queue-v1";
const PERM_ACK_KEY = "musicgo-perm-ack-v1";

const BADGES = {
  analyzing: { text: "Analizando…", cls: "badge-info" },
  pending: { text: "Pendiente", cls: "badge-pending" },
  downloading: { text: "Descargando…", cls: "badge-info" },
  done: { text: "✓ Hecho", cls: "badge-done" },
  error: { text: "✗ Error", cls: "badge-error" },
};

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Recupera la cola guardada (sobrevive a recargas de la página) */
function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((it) => it && it.url)
      .map((it) => ({
        id: it.id || makeId(),
        url: it.url,
        // Una sesión a medias se reinicia como pendiente
        status: it.status === "done" || it.status === "error" ? it.status : "pending",
        error: it.error || null,
        realBytes: it.realBytes || null,
        usedFallback: !!it.usedFallback,
        located: it.located || "",
        foundTitle: it.foundTitle || "",
        info: it.info || null,
        format: FORMAT_META[it.format] ? it.format : "opus",
        title: it.title || "",
        artist: it.artist || "",
        filename: it.filename || "",
      }));
  } catch {
    return [];
  }
}

export default function QueueForm() {
  const [items, setItems] = useState(loadStored);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [running, setRunning] = useState(false);
  const [queueProgress, setQueueProgress] = useState({ done: 0, total: 0, stage: "", liveStage: "" });
  const [message, setMessage] = useState(null);
  const [permAck, setPermAck] = useState(() => {
    try {
      return sessionStorage.getItem(PERM_ACK_KEY) === "1";
    } catch {
      return false;
    }
  });
  const pollRef = useRef(null);
  const runningRef = useRef(false);
  const msgTimerRef = useRef(null);
  const permWarnedRef = useRef(false);

  // Persistir la cola cuando cambie
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* sin espacio: ignorar */
    }
  }, [items]);

  useEffect(() => () => {
    stopPolling();
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
  }, []);

  const busy = adding || running;
  const pendingCount = items.filter((it) => it.status === "pending" || it.status === "error").length;
  const errorCount = items.filter((it) => it.status === "error").length;

  /** Muestra un aviso temporal (se oculta solo, tiempo real) */
  function flashMessage(type, text, ms = 6000) {
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    setMessage({ type, text });
    msgTimerRef.current = setTimeout(() => setMessage(null), ms);
  }

  /** Marca el permiso de descarga múltiple como aceptado en esta sesión */
  function acceptPerm() {
    setPermAck(true);
    try {
      sessionStorage.setItem(PERM_ACK_KEY, "1");
    } catch {
      /* sin almacenamiento */
    }
  }

  /**
   * Avisa (una vez por sesión de ejecución) que el navegador pedirá permiso
   * para descargar varios archivos. Como no existe API para concederlo
   * programáticamente, solo recordamos al usuario que debe aceptar el diálogo.
   */
  function warnMultiDownloadPermission() {
    if (permAck || permWarnedRef.current) return;
    permWarnedRef.current = true;
    flashMessage(
      "error",
      "El navegador puede pedirte permiso para «descargar varios archivos». Cuando aparezca el aviso, elige «Permitir» para que las canciones se guarden.",
      9000
    );
  }

  /* ---------- Añadir enlaces (una URL por línea) ---------- */
  async function addUrls() {
    const urls = input.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!urls.length) {
      flashMessage("error", "Pega al menos un enlace de YouTube.", 5000);
      return;
    }
    setAdding(true);
    setMessage(null);
    let ok = 0;
    for (const url of urls) {
      const id = makeId();
      setItems((prev) => [
        ...prev,
        { id, url, status: "analyzing", error: null, realBytes: null, usedFallback: false, located: "", foundTitle: "", info: null, format: "opus", title: "", artist: "", filename: "" },
      ]);
      try {
        const data = await getInfo(url);
        setItems((prev) =>
          prev.map((it) =>
            it.id === id
              ? {
                  ...it,
                  status: "pending",
                  info: data,
                  title: data.title || "",
                  artist: data.artist || "",
                  filename: data.artist ? `${data.artist} - ${data.title}` : data.title || "",
                  format: data.sizes?.opus?.bytes ? "opus" : "mp3",
                }
              : it
          )
        );
        ok++;
      } catch (err) {
        setItems((prev) =>
          prev.map((it) => (it.id === id ? { ...it, status: "error", error: err.message } : it))
        );
      }
    }
    setAdding(false);
    setInput("");
    if (ok) {
      flashMessage("success", `${ok} enlace${ok === 1 ? "" : "s"} agregado${ok === 1 ? "" : "s"} a la cola.`, 5000);
    } else {
      flashMessage("error", "No se pudo analizar ningún enlace.", 8000);
    }
  }

  /* ---------- Utilidades de la lista ---------- */
  function patchItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function moveItem(id, dir) {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return arr;
    });
  }

  /* ---------- Ejecución secuencial (1 a la vez) ---------- */
  const BETWEEN_DOWNLOADS_MS = 1500; // pausa suave para que el navegador registre cada descarga/permiso

  async function execItems(list) {
    runningRef.current = true;
    setRunning(true);
    setMessage(null);
    startPolling();
    let done = 0;
    let failed = 0;
    const total = list.length;
    setQueueProgress({ done: 0, total, stage: `Iniciando (0/${total})…`, liveStage: "" });
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      // Al iniciar cada descarga, pedimos explícitamente el permiso múltiple si falta
      warnMultiDownloadPermission();
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: "downloading", error: null } : it))
      );
      setQueueProgress((q) => ({ ...q, done: i, stage: `Descargando (${i + 1}/${total})…` }));
      try {
        const r = await downloadTrack({
          url: item.url,
          format: item.format,
          filename: item.filename.trim() || null,
          title: item.title,
          artist: item.artist,
        });
        // Pequeña pausa: el navegador guarda el archivo y avisa el permiso antes de continuar
        await sleep(BETWEEN_DOWNLOADS_MS);
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: "done",
                  realBytes: r.sizeBytes,
                  usedFallback: !!r.fallback,
                  located: r.located || "",
                  foundTitle: r.foundTitle || "",
                }
              : it
          )
        );
        done++;
      } catch (err) {
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: "error", error: err.message } : it))
        );
        failed++;
      }
    }
    stopPolling();
    runningRef.current = false;
    setRunning(false);
    setQueueProgress({ done, total, stage: `Listo: ${done} ok, ${failed} con error.`, liveStage: "" });
    flashMessage(
      failed ? "error" : "success",
      total === 1
        ? failed
          ? "La descarga falló. Revisa el error del ítem."
          : "Canción descargada correctamente."
        : `Cola terminada: ${done} descargada${done === 1 ? "" : "s"}, ${failed} con error.`,
      failed ? 10000 : 6000
    );
  }

  function downloadAll() {
    const targets = items.filter((it) => it.status === "pending" || it.status === "error");
    if (!targets.length) {
      flashMessage("error", "No hay canciones pendientes en la cola.", 5000);
      return;
    }
    execItems(targets);
  }

  function downloadOne(id) {
    const it = items.find((x) => x.id === id);
    if (!it || runningRef.current) return;
    execItems([{ ...it, status: "pending", error: null }]);
  }

  function retryFailed() {
    const bad = items.filter((it) => it.status === "error");
    if (!bad.length) return;
    execItems(bad.map((it) => ({ ...it, status: "pending", error: null })));
  }

  /* ---------- Progreso: barra propia + etapa real del backend ---------- */
  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const p = await getProgress();
        if (p && p.stage && runningRef.current) {
          setQueueProgress((q) => ({ ...q, liveStage: p.stage }));
        }
      } catch {
        /* sin backend */
      }
    }, 700);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  const queuePercent = queueProgress.total ? Math.round((queueProgress.done / queueProgress.total) * 100) : 0;
  const queueStage =
    running && queueProgress.liveStage
      ? `${queueProgress.stage} · ${queueProgress.liveStage}`
      : queueProgress.stage;

  return (
    <section className="card glass queue-card" aria-label="Cola de descargas">
      {!permAck && (
        <div className="notice perm">
          <div>
            <strong><i className="bi bi-bell" aria-hidden="true"></i> Permiso de descarga múltiple</strong>
            <span>
              Al descargar varias canciones, el navegador pedirá autorización para
              guardar múltiples archivos. Cuando aparezca ese aviso, elige{" "}
              <b>«Permitir»</b>. Esto solo se solicita una vez por sesión.
            </span>
          </div>
          <button className="btn btn-ghost perm-btn" onClick={acceptPerm}>
            Entendido
          </button>
        </div>
      )}

      <div className="queue-add">
        <textarea
          className="queue-textarea"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={"Pega uno o varios enlaces (uno por línea)…\nhttps://www.youtube.com/watch?v=…"}
          disabled={busy}
        />
        <button className="btn" onClick={addUrls} disabled={busy || !input.trim()}>
          {adding ? (
            <>
              <span className="spinner" /> Analizando…
            </>
          ) : (
            <>
              <i className="bi bi-plus-circle" aria-hidden="true"></i> Añadir a la cola
            </>
          )}
        </button>
      </div>

      {items.length > 0 && (
        <>
          <div className="queue-toolbar">
            <button className="btn" onClick={downloadAll} disabled={running || pendingCount === 0}>
              <i className="bi bi-download" aria-hidden="true"></i> Descargar ({pendingCount})
            </button>
            {errorCount > 0 && (
              <button className="btn btn-ghost" onClick={retryFailed} disabled={running}>
                <i className="bi bi-arrow-repeat" aria-hidden="true"></i> Reintentar fallidas ({errorCount})
              </button>
            )}
            <button
              className="btn btn-ghost"
              onClick={() => {
                if (window.confirm("¿Vaciar toda la cola?")) setItems([]);
              }}
              disabled={running}
            >
              <i className="bi bi-trash" aria-hidden="true"></i> Vaciar
            </button>

            {/* Selector de formato por lote: aplica el formato a todos los pendientes */}
            <label className="queue-fmt-batch">
              <span className="queue-fmt-batch-label">Formato para todas:</span>
              <select
                className="queue-fmt"
                onChange={(e) => {
                  const fmt = e.target.value;
                  const affected = items.filter(
                    (it) => it.status === "pending" || it.status === "error"
                  ).length;
                  setItems(
                    items.map((it) => {
                      if (it.status === "pending" || it.status === "error") {
                        return { ...it, format: fmt };
                      }
                      return it;
                    })
                  );
                  if (affected > 0) {
                    flashMessage(
                      "success",
                      `${FORMAT_META[fmt].label} aplicado a ${affected} canción${affected === 1 ? "" : "es"} pendiente${affected === 1 ? "" : "s"}.`,
                      4000
                    );
                  }
                }}
                defaultValue={items.length > 0 ? items[0].format : "opus"}
                disabled={running}
                aria-label="Formato para todas las canciones pendientes"
              >
                {Object.entries(FORMAT_META).map(([k, f]) => (
                  <option key={k} value={k}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="queue-list">
            {items.map((it, idx) => (
              <div className={`queue-item ${it.status}`} key={it.id}>
                <div className="queue-head">
                  {it.info?.thumbnail ? (
                    <img className="queue-thumb" src={it.info.thumbnail} alt="" loading="lazy" />
                  ) : (
                    <div className="queue-thumb queue-thumb-empty">
                      <i className="bi bi-music-note-beamed" aria-hidden="true"></i>
                    </div>
                  )}

                  <div className="queue-main">
                    <div className="queue-row">
                      <input
                        className="queue-input"
                        value={it.title}
                        onChange={(e) => patchItem(it.id, { title: e.target.value })}
                        disabled={running}
                        placeholder="Título (editable)"
                        aria-label="Título"
                      />
                      <select
                        className="queue-fmt"
                        value={it.format}
                        onChange={(e) => patchItem(it.id, { format: e.target.value })}
                        disabled={running}
                        aria-label="Formato"
                      >
                        {Object.entries(FORMAT_META).map(([k, f]) => (
                          <option key={k} value={k}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      {it.info?.sizes?.[it.format]?.label ? (
                        <span className="queue-est">≈ {it.info.sizes[it.format].label}</span>
                      ) : null}
                    </div>

                    <div className="queue-row">
                      <input
                        className="queue-input"
                        value={it.artist}
                        onChange={(e) => patchItem(it.id, { artist: e.target.value })}
                        disabled={running}
                        placeholder="Artista (editable)"
                        aria-label="Artista"
                      />
                      <input
                        className="queue-input"
                        value={it.filename}
                        onChange={(e) => patchItem(it.id, { filename: e.target.value })}
                        disabled={running}
                        placeholder="Nombre del archivo"
                        aria-label="Nombre del archivo"
                      />
                    </div>

                    <div className="queue-state">
                      <span className={`badge2 ${BADGES[it.status].cls}`}>{BADGES[it.status].text}</span>
                      {it.status === "done" && it.realBytes ? (
                        <span className="queue-size">
                        <i className="bi bi-box-seam" aria-hidden="true"></i> {formatBytes(it.realBytes)} real
                      </span>
                      ) : null}
                      {it.status === "done" && it.usedFallback ? (
                        <span className="queue-fallback">
                          <i className="bi bi-lightning-charge-fill" aria-hidden="true"></i> rescatada vía
                          SoundCloud (+18)
                        </span>
                      ) : null}
                      {it.status === "error" ? <span className="queue-error">{it.error}</span> : null}
                    </div>
                  </div>

                  <div className="queue-actions">
                    <button className="icon-btn" title="Subir" onClick={() => moveItem(it.id, -1)} disabled={running || idx === 0}>
                      <i className="bi bi-arrow-up" aria-hidden="true"></i>
                    </button>
                    <button
                      className="icon-btn"
                      title="Bajar"
                      onClick={() => moveItem(it.id, 1)}
                      disabled={running || idx === items.length - 1}
                    >
                      <i className="bi bi-arrow-down" aria-hidden="true"></i>
                    </button>
                    <button className="icon-btn" title="Descargar esta" onClick={() => downloadOne(it.id)} disabled={running}>
                      <i className="bi bi-download" aria-hidden="true"></i>
                    </button>
                    <button className="icon-btn danger" title="Quitar" onClick={() => removeItem(it.id)} disabled={running}>
                      <i className="bi bi-x" aria-hidden="true"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {(running || queueProgress.total > 0) && (
            <div className="progress-wrap">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${queuePercent}%` }} />
              </div>
              <p className="progress-stage">{queueStage}</p>
            </div>
          )}

          {message && <div className={`notice ${message.type}`}>{message.text}</div>}
        </>
      )}

      {items.length === 0 && !adding && (
        <p className="queue-empty">
          La cola está vacía. Pega uno o varios enlaces arriba (uno por línea) y añádelos.
          <br />
          La cola se guarda localmente: puedes cerrar la pestaña y continuar después.
        </p>
      )}
    </section>
  );
}