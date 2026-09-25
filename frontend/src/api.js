// Cliente HTTP de MusicGo hacia el backend (/api → proxy Vite → FastAPI)

async function postJSON(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `Error ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.detail) detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch {
      /* sin cuerpo JSON */
    }
    throw new Error(detail);
  }
  return res;
}

/** Analiza un enlace: {title, artist, duration, source, fallback, sizes} */
export async function getInfo(url) {
  const res = await postJSON("/api/info", { url });
  return res.json();
}

/** Descarga la pista y dispara la descarga en el navegador.
 *  Devuelve metadatos de la respuesta (fallback, tamaño real, nombre, etc.) */
export async function downloadTrack({ url, format, filename, forceFallback = false }) {
  const res = await postJSON("/api/download", {
    url,
    format,
    filename: filename || null,
    force_fallback: forceFallback,
  });

  const blob = await res.blob();
  const fallback = res.headers.get("X-MusicGo-Fallback") === "1";
  const source = res.headers.get("X-MusicGo-Source") || "youtube";
  const located = res.headers.get("X-MusicGo-Located") || "";
  const foundTitle = res.headers.get("X-MusicGo-FoundTitle") || "";
  const sizeBytes = res.headers.get("X-MusicGo-SizeBytes") || "";
  const title = res.headers.get("X-MusicGo-Title") || "";

  // Nombre final: usa el que eligió el usuario (el backend sanitiza).
  const cd = res.headers.get("Content-Disposition") || "";
  const cdName = decodeURIComponent((cd.match(/filename\*=UTF-8''([^;]+)/) || [])[1] || "");
  const fileName = cdName || `${filename || title}.${format}`;

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);

  return {
    fileName,
    fallback,
    source,
    located,
    foundTitle,
    sizeBytes: Number(sizeBytes) || blob.size,
  };
}

/** Consulta el progreso de la tarea en curso */
export async function getProgress() {
  const res = await fetch("/api/progress");
  return res.json();
}

/** Convierte bytes a texto legible */
export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "—";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}