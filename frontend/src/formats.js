export const FORMATS = {
  opus: {
    label: "OPUS",
    ext: "opus",
    icon: "bi-music-note-beamed",
    method: "Sin recodificar",
    note: "El stream original, bit a bit. La mejor opción para archivar.",
  },
  mp3: {
    label: "MP3",
    ext: "mp3",
    icon: "bi-volume-up",
    method: "320 kbps CBR",
    note: "Recodifica para coches y reproductores antiguos.",
  },
  m4a: {
    label: "M4A",
    ext: "m4a",
    icon: "bi-headphones",
    method: "AAC original",
    note: "Copia el AAC de la fuente; si no lo es, convierte a 320 kbps.",
  },
  flac: {
    label: "FLAC",
    ext: "flac",
    icon: "bi-gem",
    method: "Sin pérdida",
    note: "Contenedor sin pérdida: no mejora una fuente con pérdida.",
  },
};

export const FORMAT_KEYS = Object.keys(FORMATS);
