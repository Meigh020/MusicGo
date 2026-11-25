import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FORMATS, FORMAT_KEYS } from "../formats.js";
import { formatBytes, formatDate } from "../utils.js";
import { useLibrary } from "../context/LibraryContext.jsx";
import { usePlayer } from "../context/PlayerContext.jsx";
import { useQueue } from "../context/QueueContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import Module from "../components/Module.jsx";
import PageHead, { Stat } from "../components/PageHead.jsx";

export default function LibraryPage() {
  const { entries, remove, clear, stats } = useLibrary();
  const queue = useQueue();
  const player = usePlayer();
  const { push } = useToast();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("all");
  const [sort, setSort] = useState("recent");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const rows = entries.filter((entry) => {
      if (format !== "all" && entry.format !== format) return false;
      if (!term) return true;
      return [entry.title, entry.artist, entry.album, entry.fileName, entry.genre]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
    return rows.sort((a, b) => {
      if (sort === "title") return (a.title || "").localeCompare(b.title || "", "es");
      if (sort === "size") return (b.sizeBytes || 0) - (a.sizeBytes || 0);
      return (b.date || 0) - (a.date || 0);
    });
  }, [entries, format, query, sort]);

  function repeat(entry) {
    queue.requeue(entry);
    push(`«${entry.title}» añadida a la cola.`, {
      type: "ok",
      ms: 6000,
      action: { label: "IR A LA COLA", onClick: () => navigate("/cola") },
    });
  }

  const entryActions = (entry) => (
    <div className="row-actions">
      <button
        type="button"
        className="icon-btn"
        title="Escuchar vista previa"
        aria-label="Escuchar vista previa"
        onClick={() =>
          player.playPreview({
            url: entry.url,
            title: entry.title,
            artist: entry.artist,
            thumbnail: entry.thumbnail,
          })
        }
      >
        <i className="bi bi-play-fill" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-btn"
        title="Volver a descargar"
        aria-label="Volver a descargar"
        onClick={() => repeat(entry)}
      >
        <i className="bi bi-arrow-repeat" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-btn danger"
        title="Quitar del historial"
        aria-label="Quitar del historial"
        onClick={() => remove(entry.id)}
      >
        <i className="bi bi-x" aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div className="page-stack">
      <PageHead
        kicker="Historial local · vive en este navegador"
        title="Biblioteca"
        description="Todo lo archivado, con su formato, tamaño y fuente. Los archivos están en tu carpeta de descargas."
        stats={
          <>
            <Stat value={String(stats.count).padStart(2, "0")} label="Pistas" />
            <Stat value={stats.totalBytes ? formatBytes(stats.totalBytes) : "0 B"} label="Total" />
            <Stat value={String(stats.rescues).padStart(2, "0")} label="Rescates" />
          </>
        }
      />

      <Module id="01" title="Filtro" className="span-12">
        <div className="filter-row">
          <div className="filter-search">
            <label className="sr-only" htmlFor="lib-search">
              Buscar en la biblioteca
            </label>
            <input
              id="lib-search"
              className="field"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por título, artista, álbum o archivo…"
            />
          </div>
          <div className="chips" role="group" aria-label="Filtrar por formato">
            <button
              type="button"
              className={`chip ${format === "all" ? "active" : ""}`}
              onClick={() => setFormat("all")}
            >
              Todos <em>{entries.length}</em>
            </button>
            {FORMAT_KEYS.map((key) => {
              const count = entries.filter((entry) => entry.format === key).length;
              return (
                <button
                  key={key}
                  type="button"
                  className={`chip ${format === key ? "active" : ""}`}
                  onClick={() => setFormat(key)}
                >
                  {FORMATS[key].label} <em>{count}</em>
                </button>
              );
            })}
          </div>
          <label className="sort">
            <span className="lbl">Orden</span>
            <select
              className="field"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              aria-label="Ordenar biblioteca"
            >
              <option value="recent">Más recientes</option>
              <option value="title">Título A-Z</option>
              <option value="size">Tamaño</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!entries.length}
            onClick={() => {
              if (window.confirm("¿Borrar el historial de la biblioteca? Los archivos descargados no se tocan.")) {
                clear();
                push("Historial borrado. Los archivos siguen en tu disco.", { type: "ok" });
              }
            }}
          >
            <i className="bi bi-trash3" aria-hidden="true" /> Borrar historial
          </button>
        </div>
      </Module>

      <Module
        id="02"
        title="Archivo"
        className="span-12"
        right={<span className="mod-count">{filtered.length} visibles</span>}
      >
        {entries.length === 0 ? (
          <div className="empty">
            <i className="bi bi-collection" aria-hidden="true" />
            <b>Tu biblioteca está vacía</b>
            <p>Cuando descargues una pista aparecerá aquí. El historial se guarda en este navegador.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <i className="bi bi-search" aria-hidden="true" />
            <b>Sin coincidencias</b>
            <p>Prueba con otro término o quita el filtro de formato.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table lib-table">
              <thead>
                <tr>
                  <th className="col-idx">#</th>
                  <th>Pista</th>
                  <th>Formato</th>
                  <th>Tamaño</th>
                  <th>Fecha</th>
                  <th>Fuente</th>
                  <th className="col-act">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, index) => (
                  <tr key={entry.id}>
                    <td className="col-idx">{String(index + 1).padStart(2, "0")}</td>
                    <td>
                      <div className="lib-track">
                        {entry.thumbnail ? (
                          <img src={entry.thumbnail} alt="" loading="lazy" />
                        ) : (
                          <span className="r-thumb-empty" aria-hidden="true">
                            <i className="bi bi-music-note" />
                          </span>
                        )}
                        <div>
                          <b>{entry.title}</b>
                          <span>
                            {entry.artist || "Artista desconocido"}
                            {entry.album ? ` · ${entry.album}` : ""}
                            {entry.year ? ` (${entry.year})` : ""}
                          </span>
                          {entry.fileName ? <em>{entry.fileName}</em> : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="fmt-pill">{FORMATS[entry.format]?.label || entry.format}</span>
                    </td>
                    <td className="num">{formatBytes(entry.sizeBytes)}</td>
                    <td className="num">{formatDate(entry.date)}</td>
                    <td>
                      <span className={`tag ${entry.fallback ? "tag-warn" : "tag-ghost"}`}>
                        {entry.fallback ? "SOUNDCLOUD" : "YOUTUBE"}
                      </span>
                    </td>
                    <td className="col-act">{entryActions(entry)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Module>
    </div>
  );
}
