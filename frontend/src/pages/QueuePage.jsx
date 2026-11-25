import { Link } from "react-router-dom";
import { FORMATS, FORMAT_KEYS } from "../formats.js";
import { formatBytes, formatDuration } from "../utils.js";
import { usePlayer } from "../context/PlayerContext.jsx";
import { useQueue } from "../context/QueueContext.jsx";
import Module, { Rail } from "../components/Module.jsx";
import PageHead, { Stat } from "../components/PageHead.jsx";
import { useToast } from "../context/ToastContext.jsx";

const STATUS = {
  analyzing: { label: "ANALIZANDO", tag: "tag-ghost" },
  pending: { label: "PENDIENTE", tag: "tag-pending" },
  downloading: { label: "ACTIVA", tag: "tag-live" },
  done: { label: "HECHA", tag: "tag-done" },
  error: { label: "ERROR", tag: "tag-error" },
};

export default function QueuePage() {
  const queue = useQueue();
  const player = usePlayer();
  const { push } = useToast();

  function applyFormatToAll(format) {
    const targets = queue.items.filter(
      (item) => item.status === "pending" || item.status === "error"
    );
    targets.forEach((item) => queue.patchItem(item.id, { format }));
    if (targets.length) {
      push(`${FORMATS[format].label} aplicado a ${targets.length} pendiente${targets.length === 1 ? "" : "s"}.`, {
        type: "ok",
        ms: 4000,
      });
    }
  }

  return (
    <div className="page-stack">
      <PageHead
        kicker="Descarga en lote"
        title="Cola"
        description="Varias pistas, una tras otra. El navegador pedirá permiso una vez por sesión."
        stats={
          <>
            <Stat value={String(queue.pendingCount).padStart(2, "0")} label="Pendientes" />
            <Stat value={String(queue.doneCount).padStart(2, "0")} label="Hechas" />
            <Stat value={String(queue.errorCount).padStart(2, "0")} label="Errores" />
          </>
        }
      />

      {!queue.permAck ? (
        <div className="permission">
          <div>
            <b className="permission-title">
              <i className="bi bi-bell" aria-hidden="true" /> Permiso de descarga múltiple
            </b>
            <span>
              Cuando el navegador pregunte si permites «descargar varios archivos», elige{" "}
              <b>Permitir</b>. Solo se pide una vez por sesión.
            </span>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={queue.acceptPerm}>
            Entendido
          </button>
        </div>
      ) : null}

      <div className="grid">
        <Module id="01" title="Añadir" className="span-4">
          <textarea
            className="field area"
            rows={5}
            value={queue.input}
            onChange={(event) => queue.setInput(event.target.value)}
            placeholder={"Un enlace por línea.\nTambién una playlist completa.\n\nhttps://www.youtube.com/watch?v=…"}
            disabled={queue.adding || queue.running}
            aria-label="Enlaces para añadir a la cola"
          />
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => queue.addUrls(queue.input)}
            disabled={queue.adding || queue.running || !queue.input.trim()}
          >
            {queue.adding ? (
              <>
                <span className="spin" aria-hidden="true" /> Analizando…
              </>
            ) : (
              <>
                <i className="bi bi-plus-lg" aria-hidden="true" /> Añadir a la cola
              </>
            )}
          </button>
          <p className="note quiet">
            Las playlists se expanden hasta 100 pistas. Cada enlace se analiza para traer título,
            artista, duración y tamaños.
          </p>
        </Module>

        <Module id="02" title="Control" className="span-8">
          <div className="run-head">
            <div>
              <span className="lbl">{queue.running ? "Trabajando" : "Estado"}</span>
              <b className="run-stage">
                {queue.running ? queue.runState.live || queue.runState.stage : "Lista para empezar"}
              </b>
            </div>
            <span className="run-count">
              {queue.runState.done}/{queue.runState.total || 0}
            </span>
          </div>
          <Rail percent={queue.queuePercent} label="Progreso de la cola" className="rail-lg" />

          <div className="control-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={queue.downloadAll}
              disabled={queue.running || queue.pendingCount === 0}
            >
              <i className="bi bi-download" aria-hidden="true" /> Descargar ({queue.pendingCount})
            </button>
            {queue.running ? (
              <button type="button" className="btn btn-danger" onClick={queue.cancelActive}>
                <i className="bi bi-x-octagon" aria-hidden="true" /> Cancelar actual
              </button>
            ) : null}
            {queue.errorCount > 0 ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={queue.retryFailed}
                disabled={queue.running}
              >
                <i className="bi bi-arrow-repeat" aria-hidden="true" /> Reintentar ({queue.errorCount})
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (window.confirm("¿Vaciar toda la cola?")) queue.clear();
              }}
              disabled={queue.running || queue.items.length === 0}
            >
              <i className="bi bi-trash3" aria-hidden="true" /> Vaciar
            </button>

            <label className="batch">
              <span className="lbl">Formato para todas</span>
              <select
                className="field"
                defaultValue="opus"
                disabled={queue.running}
                onChange={(event) => applyFormatToAll(event.target.value)}
                aria-label="Aplicar formato a todas las pendientes"
              >
                {FORMAT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {FORMATS[key].label} · {FORMATS[key].method}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="control-foot">
            {queue.runState.total > 0 ? (
              <span>{queue.runState.stage}</span>
            ) : (
              <span>Sin trabajos en esta sesión.</span>
            )}
            <Link to="/biblioteca">Abrir biblioteca ({queue.doneCount})</Link>
          </div>
        </Module>

        <Module
          id="03"
          title="Pistas"
          className="span-12"
          right={<span className="mod-count">{queue.items.length} en total</span>}
        >
          {queue.items.length === 0 ? (
            <div className="empty">
              <i className="bi bi-list-ol" aria-hidden="true" />
              <b>La cola está vacía</b>
              <p>Pega uno o varios enlaces arriba, o una playlist completa. Se guarda en tu navegador.</p>
            </div>
          ) : (
            <div className="qlist">
              {queue.items.map((item, index) => {
                const status = STATUS[item.status] || STATUS.pending;
                const size = item.info?.sizes?.[item.format];
                const previewKey = `${item.url}|preview`;
                const playing = player.current?.key === previewKey && player.playing;
                return (
                  <article className={`qrow ${item.status}`} key={item.id}>
                    <span className="qidx">{String(index + 1).padStart(2, "0")}</span>

                    <div className="qthumb">
                      {item.info?.thumbnail ? (
                        <img src={item.info.thumbnail} alt="" loading="lazy" />
                      ) : (
                        <span className="r-thumb-empty" aria-hidden="true">
                          <i className="bi bi-music-note" />
                        </span>
                      )}
                    </div>

                    <div className="qbody">
                      <div className="qline">
                        <input
                          className="field"
                          value={item.title}
                          onChange={(event) => queue.patchItem(item.id, { title: event.target.value })}
                          disabled={queue.running}
                          placeholder="Título"
                          aria-label={`Título de la pista ${index + 1}`}
                        />
                        <select
                          className="field q-format"
                          value={item.format}
                          onChange={(event) => queue.patchItem(item.id, { format: event.target.value })}
                          disabled={queue.running}
                          aria-label={`Formato de la pista ${index + 1}`}
                        >
                          {FORMAT_KEYS.map((key) => (
                            <option key={key} value={key}>
                              {FORMATS[key].label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="qline">
                        <input
                          className="field"
                          value={item.artist}
                          onChange={(event) => queue.patchItem(item.id, { artist: event.target.value })}
                          disabled={queue.running}
                          placeholder="Artista"
                          aria-label={`Artista de la pista ${index + 1}`}
                        />
                        <input
                          className="field"
                          value={item.filename}
                          onChange={(event) =>
                            queue.patchItem(item.id, {
                              filename: event.target.value,
                              fileNameTouched: true,
                            })
                          }
                          disabled={queue.running}
                          placeholder="Nombre del archivo"
                          aria-label={`Nombre de archivo de la pista ${index + 1}`}
                        />
                      </div>

                      <div className="qmeta">
                        <span className={`tag ${status.tag}`}>{status.label}</span>
                        <span className="qsize">
                          {item.status === "done" && item.realBytes
                            ? `${formatBytes(item.realBytes)} real`
                            : size?.label
                              ? `≈ ${size.label}`
                              : item.info?.duration
                                ? formatDuration(item.info.duration)
                                : "—"}
                        </span>
                        {item.usedFallback ? (
                          <span className="tag tag-warn">
                            <i className="bi bi-lightning-charge" aria-hidden="true" /> SOUNDCLOUD
                          </span>
                        ) : null}
                        {item.status === "downloading" ? (
                          <span className="qstage">
                            {item.stage || "Descargando…"} · {item.progress}%
                          </span>
                        ) : null}
                        {item.status === "error" ? <span className="qerr">{item.error}</span> : null}
                      </div>

                      {item.status === "downloading" ? (
                        <Rail percent={item.progress} label={`Progreso de ${item.title}`} />
                      ) : null}
                    </div>

                    <div className="qactions">
                      <button
                        type="button"
                        className="icon-btn"
                        title={playing ? "Pausar vista previa" : "Escuchar vista previa"}
                        aria-label={playing ? "Pausar vista previa" : "Escuchar vista previa"}
                        onClick={() =>
                          player.playPreview({
                            url: item.url,
                            title: item.title,
                            artist: item.artist,
                            thumbnail: item.info?.thumbnail,
                          })
                        }
                        disabled={item.status === "analyzing"}
                      >
                        <i className={`bi ${playing ? "bi-pause-fill" : "bi-play-fill"}`} aria-hidden="true" />
                      </button>
                      {!item.info?.sizes ? (
                        <button
                          type="button"
                          className="icon-btn"
                          title="Analizar tamaños"
                          aria-label="Analizar tamaños"
                          onClick={() => queue.analyzeItem(item.id)}
                          disabled={queue.running || item.status === "analyzing"}
                        >
                          <i className="bi bi-arrows-expand" aria-hidden="true" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="icon-btn red"
                        title="Descargar esta"
                        aria-label="Descargar esta"
                        onClick={() => queue.downloadOne(item.id)}
                        disabled={queue.running || item.status === "analyzing"}
                      >
                        <i className="bi bi-download" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Subir"
                        aria-label="Subir"
                        onClick={() => queue.moveItem(item.id, -1)}
                        disabled={queue.running || index === 0}
                      >
                        <i className="bi bi-arrow-up" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Bajar"
                        aria-label="Bajar"
                        onClick={() => queue.moveItem(item.id, 1)}
                        disabled={queue.running || index === queue.items.length - 1}
                      >
                        <i className="bi bi-arrow-down" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Quitar"
                        aria-label="Quitar"
                        onClick={() => queue.removeItem(item.id)}
                        disabled={queue.running}
                      >
                        <i className="bi bi-x" aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Module>
      </div>
    </div>
  );
}
