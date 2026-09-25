# 🎵 MusicGo

Descargador de música web: pega un enlace de YouTube, elige el formato y descarga.

## Formatos soportados

- ✨ **OPUS** (original, sin recodificar — la mejor calidad posible) ⭐ por defecto
- 🔊 **MP3** (VBR V0 ~245 kbps)
- 🎧 **M4A** (AAC 320 kbps)
- 💎 **FLAC** (sin pérdida)

## Características

- 🎨 Diseño **glassmorfismo** claro azulado, responsive (PC, laptop, tablet, móvil).
- 📦 Muestra el **tamaño estimado de cada formato** al analizar un enlace y el
  tamaño real exacto al descargar.
- ✏️ **Nombre del archivo editable** antes de descargar.
- ⚡ **Auto-recuperación +18**: si YouTube bloquea la pista por restricción de
  edad, MusicGo rescata título/artista vía la API pública de YouTube (oEmbed) y
  busca la versión oficial en SoundCloud, avisándote de forma transparente.
- 🍩 Aviso de **cookies** y páginas de **Privacidad** y **Términos**.
- 🔑 Soporte opcional de `backend/cookies.txt` (formato Netscape) para contenido
  privado que te corresponda. ⚠️ Nunca subas ese archivo a un repositorio público.

## Requisitos

- Python 3.12+
- Node.js 20+
- ffmpeg en el PATH (descárgalo de https://www.gyan.dev/ffmpeg/builds/ si no lo tienes)

## Cómo arrancar (desarrollo)

```bash
# 1) Dependencias (solo la primera vez)
pip install -r backend/requirements.txt
cd frontend && npm install

# 2) Servidores (dos terminales)
cd backend  && python -m uvicorn app:app --host 127.0.0.1 --port 8000
cd frontend && npm run dev
```

> 💡 En Windows puedes usar el script `dev.bat` (doble clic): arranca backend y
> frontend a la vez y abre http://localhost:5173

## Estructura

```
MusicGo/
├── backend/        → Python + FastAPI + yt-dlp + ffmpeg (la "cocina")
│   ├── app.py
│   └── downloads/  → archivos temporales (se autolimpian)
└── frontend/       → React + Vite (la página web)
```

## ⚠️ Uso responsable

Esta herramienta solo debe usarse con contenido propio, libre de derechos o con
permiso del autor. Respeta los términos de servicio de las plataformas y las
leyes locales. Ver [Términos](PLAN.md) y la política de privacidad en la app.

## Documentación

Ver [PLAN.md](PLAN.md): arquitectura, tutorial de conceptos web, estrategia de
calidad de audio (por qué OPUS original es la mejor opción) y plan por fases.