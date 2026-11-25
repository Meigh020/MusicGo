import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { cancelTask, downloadTrack, getInfo, getPlaylist, getTask } from "../api.js";
import { composeFilename, makeId, saveJSON, sleep } from "../utils.js";
import { useLibrary } from "./LibraryContext.jsx";
import { usePlayer } from "./PlayerContext.jsx";
import { useToast } from "./ToastContext.jsx";

const QueueContext = createContext(null);
const STORAGE_KEY = "musicgo-queue-v1";
const PERM_ACK_KEY = "musicgo-perm-ack-v2";
const BETWEEN_DOWNLOADS_MS = 1100;
const FORMATS = ["opus", "mp3", "m4a", "flac"];

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((item) => item && item.url)
      .map((item) => ({
        id: item.id || makeId(),
        url: item.url,
        status:
          item.status === "done" || item.status === "error" ? item.status : "pending",
        error: item.error || null,
        realBytes: item.realBytes || null,
        usedFallback: !!item.usedFallback,
        located: item.located || "",
        foundTitle: item.foundTitle || "",
        info: item.info || null,
        format: FORMATS.includes(item.format) ? item.format : "opus",
        title: item.title || "",
        artist: item.artist || "",
        album: item.album || "",
        genre: item.genre || "",
        year: item.year || "",
        track: item.track || "",
        filename: item.filename || "",
        fileNameTouched: !!item.fileNameTouched,
        progress: 0,
        stage: "",
      }));
  } catch {
    return [];
  }
}

export function QueueProvider({ children }) {
  const { push } = useToast();
  const { add: addToLibrary } = useLibrary();
  const player = usePlayer();

  const [items, setItems] = useState(loadStored);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [running, setRunning] = useState(false);
  const [runState, setRunState] = useState({ done: 0, total: 0, stage: "", live: "" });
  const [permAck, setPermAck] = useState(() => {
    try {
      return sessionStorage.getItem(PERM_ACK_KEY) === "1";
    } catch {
      return false;
    }
  });

  const runningRef = useRef(false);
  const activeRef = useRef(null);
  const cancelledRef = useRef(false);
  const warnedRef = useRef(false);

  useEffect(() => {
    saveJSON(STORAGE_KEY, items);
  }, [items]);

  useEffect(() => {
    return () => {
      runningRef.current = false;
    };
  }, []);

  // Polling del progreso de la tarea activa (una sola descarga a la vez).
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(async () => {
      const active = activeRef.current;
      if (!active) return;
      const task = await getTask(active.taskId);
      if (!task) return;
      setItems((prev) =>
        prev.map((item) =>
          item.id === active.itemId
            ? { ...item, progress: task.percent || 0, stage: task.stage || "" }
            : item
        )
      );
      setRunState((prev) =>
        prev.live === task.stage ? prev : { ...prev, live: task.stage || "" }
      );
    }, 550);
    return () => clearInterval(timer);
  }, [running]);

  const patchItem = useCallback((id, patch) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        if (
          !next.fileNameTouched &&
          (patch.title !== undefined || patch.artist !== undefined)
        ) {
          const title = next.title || "";
          const artist = next.artist || "";
          next.filename = composeFilename(title, artist);
        }
        return next;
      })
    );
  }, []);

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const moveItem = useCallback((id, direction) => {
    setItems((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const addEntries = useCallback(
    (entries, { silent = false } = {}) => {
      const next = entries
        .filter((entry) => entry && entry.url)
        .map((entry) => ({
          id: makeId(),
          url: entry.url,
          status: "pending",
          error: null,
          realBytes: null,
          usedFallback: false,
          located: "",
          foundTitle: "",
          info: {
            title: entry.title || "",
            artist: entry.artist || "",
            duration: entry.duration || null,
            thumbnail: entry.thumbnail || "",
            sizes: null,
          },
          format: "opus",
          title: entry.title || "",
          artist: entry.artist || "",
          album: "",
          genre: "",
          year: "",
          track: "",
          filename: composeFilename(entry.title, entry.artist),
          fileNameTouched: false,
          progress: 0,
          stage: "",
        }));
      if (!next.length) return 0;
      setItems((prev) => [...prev, ...next]);
      if (!silent) {
        push(
          `${next.length} pista${next.length === 1 ? "" : "s"} añadida${next.length === 1 ? "" : "s"} a la cola.`,
          { type: "ok", ms: 4500 }
        );
      }
      return next.length;
    },
    [push]
  );

  const addUrls = useCallback(
    async (rawText) => {
      const lines = (rawText || "")
        .split(/\s*\n\s*/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (!lines.length) {
        push("Pega al menos un enlace o una playlist.", { type: "error" });
        return;
      }
      setAdding(true);
      let added = 0;
      let failed = 0;

      for (const line of lines) {
        if (/[?&]list=|\/playlist\b|\/sets\//i.test(line)) {
          try {
            const playlist = await getPlaylist(line);
            added += addEntries(playlist.results, { silent: true });
            push(
              `Playlist «${playlist.title}»: ${playlist.results.length} pista${
                playlist.results.length === 1 ? "" : "s"
              } en la cola${playlist.truncated ? " (limitada a 100)" : ""}.`,
              { type: "ok", ms: 6000 }
            );
          } catch (err) {
            failed += 1;
            push(err.message || "No se pudo leer la playlist.", { type: "error", ms: 8000 });
          }
          continue;
        }

        const id = makeId();
        setItems((prev) => [
          ...prev,
          {
            id,
            url: line,
            status: "analyzing",
            error: null,
            realBytes: null,
            usedFallback: false,
            located: "",
            foundTitle: "",
            info: null,
            format: "opus",
            title: "",
            artist: "",
            album: "",
            genre: "",
            year: "",
            track: "",
            filename: "",
            fileNameTouched: false,
            progress: 0,
            stage: "Analizando…",
          },
        ]);

        try {
          const data = await getInfo(line);
          setItems((prev) =>
            prev.map((item) =>
              item.id === id
                ? {
                    ...item,
                    status: "pending",
                    info: data,
                    title: data.title || "",
                    artist: data.artist || "",
                    filename: composeFilename(data.title, data.artist),
                    fileNameTouched: false,
                    format: data.sizes?.opus?.bytes ? "opus" : "mp3",
                    stage: "",
                  }
                : item
            )
          );
          added += 1;
        } catch (err) {
          failed += 1;
          setItems((prev) =>
            prev.map((item) =>
              item.id === id
                ? { ...item, status: "error", error: err.message, stage: "" }
                : item
            )
          );
        }
      }

      setAdding(false);
      setInput("");
      if (added && !failed) {
        push(
          `${added} pista${added === 1 ? "" : "s"} lista${added === 1 ? "" : "s"} para descargar.`,
          { type: "ok", ms: 4500 }
        );
      } else if (failed) {
        push(
          added
            ? `${added} añadida${added === 1 ? "" : "s"}, ${failed} con error.`
            : "No se pudo analizar ningún enlace.",
          { type: "error", ms: 8000 }
        );
      }
    },
    [addEntries, push]
  );

  const analyzeItem = useCallback(
    async (id) => {
      const item = items.find((entry) => entry.id === id);
      if (!item) return;
      patchItem(id, { status: "analyzing", stage: "Analizando…", error: null });
      try {
        const data = await getInfo(item.url);
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  status: "pending",
                  info: data,
                  title: entry.title || data.title || "",
                  artist: entry.artist || data.artist || "",
                  filename:
                    entry.filename ||
                    composeFilename(entry.title || data.title, entry.artist || data.artist),
                  stage: "",
                }
              : entry
          )
        );
      } catch (err) {
        patchItem(id, { status: "error", error: err.message, stage: "" });
      }
    },
    [items, patchItem]
  );

  const warnPermission = useCallback(() => {
    if (permAck || warnedRef.current) return;
    warnedRef.current = true;
    push(
      "El navegador pedirá permiso para descargar varios archivos. Elige «Permitir».",
      { type: "info", ms: 10000 }
    );
  }, [permAck, push]);

  const acceptPerm = useCallback(() => {
    setPermAck(true);
    try {
      sessionStorage.setItem(PERM_ACK_KEY, "1");
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  const execItems = useCallback(
    async (list) => {
      if (runningRef.current || !list.length) return;
      runningRef.current = true;
      setRunning(true);
      cancelledRef.current = false;
      let done = 0;
      let failed = 0;
      const total = list.length;
      setRunState({ done: 0, total, stage: `Preparando 1 de ${total}…`, live: "" });

      for (let index = 0; index < list.length; index += 1) {
        const item = list[index];
        warnPermission();
        const taskId = makeId();
        activeRef.current = { taskId, itemId: item.id };
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: "downloading",
                  error: null,
                  progress: 0,
                  stage: "Iniciando…",
                }
              : entry
          )
        );
        setRunState({
          done: index,
          total,
          stage: `Descargando ${index + 1} de ${total}…`,
          live: "",
        });

        try {
          const result = await downloadTrack({
            url: item.url,
            format: item.format,
            filename: item.filename?.trim() || null,
            title: item.title,
            artist: item.artist,
            album: item.album,
            genre: item.genre,
            year: item.year,
            track: item.track,
            taskId,
          });
          setItems((prev) =>
            prev.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: "done",
                    realBytes: result.sizeBytes,
                    usedFallback: !!result.fallback,
                    located: result.located || "",
                    foundTitle: result.foundTitle || "",
                    progress: 100,
                    stage: "Listo",
                  }
                : entry
            )
          );
          addToLibrary({
            url: item.url,
            title: item.title || "Audio",
            artist: item.artist || "",
            album: item.album || "",
            genre: item.genre || "",
            year: item.year || "",
            track: item.track || "",
            format: item.format,
            sizeBytes: result.sizeBytes,
            fileName: result.fileName,
            fallback: !!result.fallback,
            source: result.source,
            thumbnail: item.info?.thumbnail || "",
          });
          push(`«${item.title || item.filename || "Pista"}» descargada.`, {
            type: result.fallback ? "info" : "ok",
            ms: 8000,
            action: {
              label: "REPRODUCIR",
              onClick: () =>
                player.playDownloaded(result.blob, {
                  url: item.url,
                  title: item.title,
                  artist: item.artist,
                  thumbnail: item.info?.thumbnail,
                }),
            },
          });
          done += 1;
        } catch (err) {
          const cancelled =
            cancelledRef.current || err.status === 499 || /cancel/i.test(err.message || "");
          const message = cancelled ? "Cancelada por el usuario" : err.message;
          setItems((prev) =>
            prev.map((entry) =>
              entry.id === item.id
                ? { ...entry, status: "error", error: message, progress: 0, stage: "" }
                : entry
            )
          );
          failed += 1;
          if (!cancelled) {
            push(`Error en «${item.title || "pista"}»: ${message}`, {
              type: "error",
              ms: 9000,
            });
          }
        } finally {
          activeRef.current = null;
          cancelledRef.current = false;
        }

        if (index < list.length - 1) await sleep(BETWEEN_DOWNLOADS_MS);
      }

      runningRef.current = false;
      setRunning(false);
      setRunState({
        done,
        total,
        stage: `Listo: ${done} descargada${done === 1 ? "" : "s"}, ${failed} con error.`,
        live: "",
      });
      push(
        total === 1
          ? failed
            ? "La descarga no se completó."
            : "Canción descargada correctamente."
          : `Cola terminada: ${done} correcta${done === 1 ? "" : "s"}, ${failed} con error.`,
        { type: failed ? "error" : "ok", ms: failed ? 9000 : 6000 }
      );
    },
    [addToLibrary, player, push, warnPermission]
  );

  const downloadAll = useCallback(() => {
    const targets = items.filter(
      (item) => item.status === "pending" || item.status === "error"
    );
    if (!targets.length) {
      push("No hay canciones pendientes en la cola.", { type: "error", ms: 4000 });
      return;
    }
    execItems(targets);
  }, [execItems, items, push]);

  const downloadOne = useCallback(
    (id) => {
      const item = items.find((entry) => entry.id === id);
      if (!item || runningRef.current) return;
      execItems([{ ...item, status: "pending", error: null }]);
    },
    [execItems, items]
  );

  const retryFailed = useCallback(() => {
    const failed = items.filter((item) => item.status === "error");
    if (!failed.length || runningRef.current) return;
    execItems(failed.map((item) => ({ ...item, status: "pending", error: null })));
  }, [execItems, items]);

  const cancelActive = useCallback(async () => {
    const active = activeRef.current;
    if (!active) return;
    cancelledRef.current = true;
    try {
      await cancelTask(active.taskId);
      push("Cancelando la descarga en curso…", { type: "info", ms: 3500 });
    } catch (err) {
      push(err.message || "No se pudo cancelar.", { type: "error" });
    }
  }, [push]);

  const requeue = useCallback(
    (entry) => {
      addEntries([{ ...entry, url: entry.url }], { silent: false });
    },
    [addEntries]
  );

  const pendingCount = items.filter(
    (item) => item.status === "pending" || item.status === "error"
  ).length;
  const errorCount = items.filter((item) => item.status === "error").length;
  const doneCount = items.filter((item) => item.status === "done").length;
  const activeItem = items.find((item) => item.status === "downloading") || null;
  const queuePercent = runState.total
    ? Math.round((runState.done / runState.total) * 100)
    : 0;

  const value = useMemo(
    () => ({
      items,
      input,
      setInput,
      adding,
      running,
      runState,
      queuePercent,
      activeItem,
      pendingCount,
      errorCount,
      doneCount,
      permAck,
      acceptPerm,
      addUrls,
      addEntries,
      patchItem,
      removeItem,
      moveItem,
      clear,
      analyzeItem,
      downloadAll,
      downloadOne,
      retryFailed,
      cancelActive,
      requeue,
    }),
    [
      acceptPerm,
      activeItem,
      addEntries,
      addUrls,
      adding,
      analyzeItem,
      cancelActive,
      clear,
      doneCount,
      downloadAll,
      downloadOne,
      errorCount,
      input,
      items,
      moveItem,
      patchItem,
      pendingCount,
      permAck,
      queuePercent,
      removeItem,
      requeue,
      retryFailed,
      runState,
      running,
    ]
  );

  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}

export function useQueue() {
  const ctx = useContext(QueueContext);
  if (!ctx) throw new Error("useQueue debe usarse dentro de QueueProvider");
  return ctx;
}
