import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { loadJSON, makeId, saveJSON } from "../utils.js";

const LibraryContext = createContext(null);
const STORAGE_KEY = "musicgo-library-v1";

function load() {
  const raw = loadJSON(STORAGE_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && item.url && item.title)
    .map((item) => ({
      id: item.id || makeId(),
      url: item.url,
      title: item.title || "Audio",
      artist: item.artist || "",
      album: item.album || "",
      genre: item.genre || "",
      year: item.year || "",
      track: item.track || "",
      format: item.format || "opus",
      sizeBytes: item.sizeBytes || 0,
      date: item.date || Date.now(),
      fileName: item.fileName || "",
      fallback: !!item.fallback,
      source: item.source || "youtube",
      thumbnail: item.thumbnail || "",
    }));
}

export function LibraryProvider({ children }) {
  const [entries, setEntries] = useState(load);

  useEffect(() => {
    saveJSON(STORAGE_KEY, entries);
  }, [entries]);

  const add = useCallback((entry) => {
    setEntries((prev) => {
      const next = [
        {
          id: makeId(),
          date: Date.now(),
          ...entry,
        },
        ...prev,
      ];
      return next.slice(0, 600);
    });
  }, []);

  const remove = useCallback((id) => {
    setEntries((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  const stats = useMemo(() => {
    const totalBytes = entries.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
    const rescues = entries.filter((item) => item.fallback).length;
    const formats = new Set(entries.map((item) => item.format));
    return { count: entries.length, totalBytes, rescues, formats: formats.size };
  }, [entries]);

  return (
    <LibraryContext.Provider value={{ entries, add, remove, clear, stats }}>
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary debe usarse dentro de LibraryProvider");
  return ctx;
}
