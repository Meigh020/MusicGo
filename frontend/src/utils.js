// Utilidades compartidas de MusicGo 2.0

export function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "—";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  return formatDuration(seconds);
}

export function formatDate(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin espacio o sin almacenamiento */
  }
}

export function looksLikeUrl(value) {
  return /^https?:\/\//i.test((value || "").trim());
}

export function isPlaylistUrl(value) {
  const url = (value || "").trim();
  return /[?&]list=/i.test(url) || /\/playlist\b/i.test(url) || /\/sets\//i.test(url);
}

export function isYouTubeUrl(value) {
  const url = (value || "").trim();
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}

export function composeFilename(title, artist) {
  const cleanTitle = String(title || "").trim();
  const cleanArtist = String(artist || "").trim();
  if (!cleanArtist) return cleanTitle;
  if (!cleanTitle) return cleanArtist;
  const lowered = cleanTitle.toLowerCase();
  const prefix = `${cleanArtist.toLowerCase()} - `;
  // Evita "Artista - Artista - Título" cuando el título ya arrastra el artista
  const body = lowered.startsWith(prefix)
    ? cleanTitle.slice(cleanArtist.length + 3).trim()
    : cleanTitle;
  return `${cleanArtist} - ${body || cleanTitle}`;
}

export function truncate(text, max = 70) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
