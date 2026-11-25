// Cliente HTTP de MusicGo 2.0 hacia el backend (/api → proxy Vite → FastAPI)

async function postJSON(path, body, signal) {
  let res;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new Error("No se pudo conectar con el backend. ¿Está corriendo en el puerto 8000?");
  }
  if (!res.ok) {
    let detail = `Error ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.detail) {
        detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
      }
    } catch {
      /* sin cuerpo JSON */
    }
    const error = new Error(detail);
    error.status = res.status;
    throw error;
  }
  return res;
}

function decodeHeader(value) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Analiza un enlace: {title, artist, duration, source, fallback, sizes, thumbnail} */
export async function getInfo(url) {
  const res = await postJSON("/api/info", { url });
  return res.json();
}

/** Búsqueda por nombre en YouTube (resultados ligeros, sin descargar). */
export async function searchYouTube(query, limit = 10) {
  const res = await postJSON("/api/search", { query, limit });
  return res.json();
}

/** Lee una playlist: {title, count, truncated, results:[...]} */
export async function getPlaylist(url) {
  const res = await postJSON("/api/playlist", { url });
  return res.json();
}

/** Descarga la vista previa (audio original cacheado en el backend). */
export async function getPreviewBlob(url) {
  const res = await postJSON("/api/preview", { url });
  return {
    blob: await res.blob(),
    cached: res.headers.get("X-MusicGo-Preview") === "cache",
  };
}

/** Descarga la pista y dispara la descarga en el navegador. */
export async function downloadTrack({
  url,
  format,
  filename,
  title,
  artist,
  album,
  genre,
  year,
  track,
  taskId,
  signal,
}) {
  const res = await postJSON(
    "/api/download",
    {
      url,
      format,
      filename: filename || null,
      title: title ?? null,
      artist: artist ?? null,
      album: album || null,
      genre: genre || null,
      year: year || null,
      track: track || null,
      task_id: taskId || null,
    },
    signal
  );

  const blob = await res.blob();
  const fallback = res.headers.get("X-MusicGo-Fallback") === "1";
  const source = res.headers.get("X-MusicGo-Source") || "youtube";
  const located = decodeHeader(res.headers.get("X-MusicGo-Located"));
  const foundTitle = decodeHeader(res.headers.get("X-MusicGo-FoundTitle"));
  const sizeBytes = res.headers.get("X-MusicGo-SizeBytes") || "";
  const returnedTask = res.headers.get("X-MusicGo-TaskId") || taskId || "";

  const cd = res.headers.get("Content-Disposition") || "";
  const cdName = decodeURIComponent((cd.match(/filename\*=UTF-8''([^;]+)/) || [])[1] || "");
  const fileName = cdName || `${filename || title || "audio"}.${format}`;

  // Descarga del navegador (URL temporal independiente del reproductor).
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 8000);

  return {
    blob,
    fileName,
    fallback,
    source,
    located,
    foundTitle,
    sizeBytes: Number(sizeBytes) || blob.size,
    taskId: returnedTask,
  };
}

/** Progreso de una tarea concreta (polling durante la descarga). */
export async function getTask(taskId) {
  if (!taskId) return null;
  try {
    const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Cancela una descarga en curso. */
export async function cancelTask(taskId) {
  const res = await postJSON(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, {});
  return res.json();
}

/** Estado global (sirve también como ping de backend). */
export async function getProgress() {
  const res = await fetch("/api/progress", { cache: "no-store" });
  return res.json();
}
