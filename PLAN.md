# MusicGo — Plan del Proyecto (y mini-tutorial)

Un **descargador de música web** que extrae audio desde enlaces (YouTube, etc.)
y lo entrega en **MP3**, **M4A**, **FLAC** y **OPUS (original)**.

> ⚠️ **Uso responsable:** esta herramienta solo debe usarse con contenido propio,
> libre de derechos o con permiso del autor. Descargar música con copyright puede
> violar los términos de servicio de las plataformas y las leyes locales.

---

## 1. ¿Qué vamos a construir?

Una aplicación web que corre en tu PC (y que más adelante podrías publicar).

**Flujo del usuario:**
1. Abre `http://localhost:5173` en el navegador.
2. Pega un enlace de YouTube.
3. Elige formato y calidad.
4. Pulsa "Descargar" y el archivo cae en sus descargas. ✅

### Requisitos de producto (definidos por el usuario)

1. 🎨 **Diseño**: glassmorfismo (efecto cristal desenfocado) con colores claros, azulados/celestes.
2. 📦 **Tamaño por formato**: al analizar un enlace se muestra el tamaño estimado de cada
   formato (OPUS/MP3/M4A/FLAC) con buena precisión, y tras descargar el tamaño real exacto.
3. ✏️ **Nombre editable**: el usuario puede editar el nombre de la canción antes de descargar.
4. 📱 **Responsividad**: se adapta a PC, laptop, tablet y móvil.
5. 🔒 **Política de privacidad** y tratamiento de datos (aunque no recopilemos datos personales).
6. 🍪 **Aviso de cookies** con términos y condiciones (no se recopilan datos de usuarios).
7. ⚡ **Auto-recuperación de pistas restringidas (+18)**:
   - Detección automática del bloqueo por restricción de edad en YouTube.
   - Rescate de metadatos (título y artista) vía API pública de YouTube (oEmbed).
   - Búsqueda alternativa en SoundCloud y descarga sin iniciar sesión, con aviso transparente.
   - Soporte opcional de `backend/cookies.txt` para videos privados del futuro.

---

## 2. Conceptos básicos

### ¿Qué es una "aplicación web"?
Tiene **dos partes** que conversan:

```
┌──────────────┐   pide cosas    ┌──────────────┐
│   FRONTEND   │ ──────────────► │   BACKEND    │
│  (lo que ves)│ ◄────────────── │ (lo que hace)│
└──────────────┘                 └──────────────┘
```

| Parte | Analogía | En MusicGo |
|---|---|---|
| **Frontend** | El menú y el mesero | La página con el cuadro de enlace, formatos y botón de descarga |
| **Backend** | La cocina | Descarga el audio y lo convierte, luego te lo sirve |

---

## 3. Arquitectura (decidida ✅)

```
 TU PC
┌──────────────────────────────────────────────────────────┐
│  NAVEGADOR                                               │
│   └─► FRONTEND: React + Vite (página web)               │
│            │  pide: "descarga este enlace como MP3"      │
│            ▼                                             │
│   BACKEND: Python + FastAPI                              │
│     ├─► yt-dlp  ── descarga el audio original           │
│     ├─► ffmpeg ── convierte a MP3 / M4A / FLAC          │
│     └─► devuelve el archivo al navegador                │
└──────────────────────────────────────────────────────────┘
```

### Estructura del proyecto (monorepo: un repo, dos carpetas)

```
MusicGo/
├── backend/                 # Python: FastAPI + yt-dlp + ffmpeg
│   ├── app.py               # El servidor (endpoints /api/...)
│   ├── requirements.txt     # Lista de bibliotecas Python
│   └── downloads/           # Archivos temporales
├── frontend/                # React + Vite (la página web)
│   ├── src/
│   │   ├── App.jsx          # La app React
│   │   ├── components/      # Botones, formularios, etc.
│   │   └── ...
│   └── package.json
└── PLAN.md
```

### Cómo se comunican frontend y backend

- En desarrollo: React corre en `localhost:5173` y el backend en `localhost:8000`.
  Vite tiene un **proxy** configurado: cuando el frontend pide `/api/...`,
  Vite lo reenvía al backend. (Se configura con 5 líneas, te lo enseño cuando lleguemos).
- En producción (Fase 4): se compila React a archivos estáticos y el backend los sirve
  directamente. Una sola URL, cero configuración extra.

### Las piezas

| Herramienta | Rol | Notas |
|---|---|---|
| **Python + FastAPI** | Backend/servidor | FastAPI genera documentación automática de tus endpoints |
| **yt-dlp** | Descarga de YouTube | Estándar de la industria |
| **ffmpeg** | Conversión de audio | Ya lo tienes instalado (v9.0.1) |
| **Node.js + npm** | Ejecutar React | Ya lo tienes (v24) |
| **React + Vite** | Frontend moderno | Vite = el "compilador" que arranca y empaqueta React |

> ¿Por qué **Vite y no Next.js**? Vite es la forma simple de aprender React puro
> (una página que pide datos a un backend = "SPA"). Next.js añade cosas de servidor
> que no necesitamos y complican el aprendizaje. Cuando domines esto, cambiar es fácil.

---

## 4. Calidad de audio: cómo sacar el máximo a cada formato 🔑

### Regla de oro (la más importante de todo el proyecto)
> **La calidad la pone la FUENTE, no la conversión.**
> Recodificar nunca *mejora* el sonido: solo lo conserva (o lo degrada).
> Por eso el mejor archivo posible es **el original sin recodificar**.

### ¿Qué audio tiene YouTube realmente?

YouTube **no ofrece FLAC ni audio sin pérdida nunca**. Lo que ofrece es:

| Stream | Códec | Calidad máx. | Contenedor |
|---|---|---|---|
| "bestaudio" | **Opus** | ~160 kbps | `.webm` / `.opus` |
| alternativa | AAC | ~256 kbps | `.m4a` |

Entonces, de YouTube **lo máximo que puedes obtener es ese Opus/AAC original**.
Cualquier FLAC que "conviertas" desde ahí es FLAC **de mentira**: un archivo enorme
que suena igual que el Opus original (o peor). No puedes crear calidad que no existe.

### Mi opinión sobre "Opus directo" 🎯

**Es la jugada correcta, y la mejor decisión técnica del proyecto.** Razones:

1. **Opus es el códec más moderno y eficiente.** A ~160 kbps ya es *transparente*
   (suena idéntico al original para el oído humano). Supera al MP3 a 320 kbps y al AAC a 256 kbps.
2. **Cero pérdida por recodificación**: al no convertir, el archivo es `bit-perfect`
   respecto a lo que YouTube te dio. Es la **mejor calidad posible desde YouTube**, punto.
3. **Compatibilidad moderna**: VLC, foobar2000, Android, iOS, Spotify-adjuntos,
   reproductores de alta fidelidad (Sony Walkman, etc.) lo leen sin problema.
   Lo único que a veces no lo lee: radios de coche antiguas.

**Conclusión:** en MusicGo, la opción "**Mejor calidad (original, Sin recodificar)**"
será la **opción por defecto y recomendada**. Guardará el `.opus` (o `.m4a`) tal cual.
Lo demás (MP3/M4A/FLAC) son *conversiones* que ofrecerás para compatibilidad.

### Matriz de formatos: método y comandos exactos

Usaremos **yt-dlp para descargar** y **ffmpeg para convertir** (yp-dlp llama a ffmpeg
automáticamente cuando le pedimos conversión):

```bash
# 1) LA MEJOR CALIDAD: stream original, sin tocar nada
yt-dlp -f bestaudio "URL"                      # → .opus/.webm o .m4a (cero pérdida)

# 2) MP3 a máxima calidad (320 kbps CBR, lo máximo que soporta MP3)
yt-dlp -f bestaudio -x --audio-format mp3 --audio-quality 320k "URL"

# 3) M4A (AAC ~320 kbps; si el original ya es m4a, solo se remuxe, sin recodificar)
yt-dlp -f bestaudio -x --audio-format m4a "URL"

# 4) FLAC (compresión nivel 8: equilibrio tamaño/velocidad; 12 = archivo más pequeño)
yt-dlp -f bestaudio -x --audio-format flac "URL"
```

Alternativa: si prefieres convertir tú mismo con ffmpeg (más control):

```bash
ffmpeg -i original.webm -c:a libmp3lame -b:a 320k  salida.mp3   # MP3 320k CBR
ffmpeg -i original.webm -c:a aac -b:a 320k      salida.m4a   # AAC 320k
ffmpeg -i original.webm -c:a flac -compression_level 8 salida.flac
```

### Resumen por formato

| Formato | Códec | Nuestra mejor calidad | Cuándo usarlo |
|---|---|---|---|
| **OPUS** | Opus (original) | La que YouTube da (~160k) — **sin recodificar** | ⭐ Archivar / mejor sonido |
| **MP3** | MP3 (LAME) | **320 kbps CBR** (máximo del formato) | Máxima compatibilidad (coches, reproductores viejos) |
| **M4A** | AAC | 320 kbps | Buen equilibrio compatibilidad/calidad |
| **FLAC** | FLAC (sin pérdida) | Solo brilla con fuente sin pérdida (Bandcamp, CDs propios) | Audiófilos con fuente lossless; de YouTube es conversión |

### 🤔 ¿Por qué "más pesado" no significa "mejor calidad"?

Duda clásica (¡y buena!). La respuesta corta: **la calidad la pone la FUENTE, no el
formato ni el tamaño.** El tamaño es una consecuencia de la *compresión*, no de la calidad.

| Formato | Qué es | Tamaño típico (3:33 min) | Calidad real |
|---|---|---|---|
| **OPUS** | Códec moderno y eficiente (~160 kbps) | **~3.3 MB** | ⭐ La mejor posible de YouTube: a 160 kbps ya es *transparente* (suena idéntico al original para el oído) |
| **MP3** | Con pérdida, 320 kbps (máximo del formato) | ~8.1 MB | Buena y compatible, pero **recodificada** desde un audio que ya tenía pérdida |
| **M4A** | AAC sin pérdida *perceptual*, 320 kbps | ~8.5 MB | Muy buena, también recodificada |
| **FLAC** | Sin pérdida (comprime como un ZIP) | ~43–45 MB | **No mejora nada desde YouTube**: conserva el mismo audio Opus que ya estaba comprimido, solo que en un archivo gigante |

**El ejemplo real de MusicGo** (canción de 3:33, fuente YouTube):

- OPUS de **3.3 MB** y FLAC de **45 MB** suenan **igual** (ambos derivan del mismo
  audio Opus de YouTube). La diferencia es que FLAC comprime sin perder datos del
  audio que recibió, pero esos datos ya eran de "segunda mano".
- Convertir una fuente con pérdida a FLAC es como hacer un ZIP de un JPEG: el ZIP
  no recupera los píxeles que el JPEG descartó, solo ocupa más espacio.

**Cuándo el peso SÍ equivale a calidad:** solo cuando la **fuente es sin pérdida**
(CDs propios, Bandcamp, WAV original). Ahí un FLAC de 45 MB sí vale más que un MP3
de 8 MB porque conserva cada bit del original.

**Regla de oro para MusicGo:**
1. Guarda siempre el **OPUS original** como "maestro" (mejor calidad, menor peso).
2. Usa MP3/M4A para *compatibilidad* (coche, reproductores viejos).
3. Ofrece FLAC solo como conversión "premium por peso" o cuando la fuente sea lossless.

### 💡 **Consejo de archivista:** guarda siempre el original (Opus/M4A) como "maestro".
> Si mañana necesitas un MP3 para el coche, conviertes *desde el original*, no desde
> otra conversión. Convertir una conversión = calidad en cascada que se degrada.

---

## 5. Plan por fases

### Fase 0 — Preparar el entorno ✅ (tu PC ya está lista)
- Python 3.14 ✅ · Node 24 ✅ · npm 11 ✅ · ffmpeg 9 ✅ · Git ✅
- Falta: crear la estructura `backend/` + `frontend/` y el primer "hola mundo" de ambos.

### Fase 1 — MVP: la tubería completa
- **Backend**: endpoint `POST /api/download` que recibe `{url, formato}` y devuelve el archivo.
  Empezamos con **OPUS (original)** y **MP3**.
- **Frontend**: React con input de enlace + selector + botón, descarga vía `fetch` + `blob`.
- Meta: pegar enlace → cae el archivo. ✅

### Fase 2 — Todos los formatos + calidad
- Agregar **M4A**, **FLAC** y selector de calidad (MP3 V0 / 320k / 128k…).
- **Progreso real** en la página (la conversión tarda): aviso por polling o WebSocket.
- Metadatos (título, artista, carátula) cuando la fuente los tenga.

### Fase 3 — Pulido
- Mensajes de error claros (enlace inválido, video privado, sin conexión).
- Diseño con estilo y logo de MusicGo (CSS + Tailwind o CSS simple, lo decidimos).
- Cola de varias descargas a la vez.

### Fase 4 — (Opcional, futuro) Publicar en internet
- VPS (Hetzner / DigitalOcean / Oracle Cloud) + Docker + dominio + HTTPS.
- ⚠️ Muchos proveedores en la nube **prohíben** yt-dlp: necesita VPS autónomo.
- Nuestro backend no cambia; solo se sirve el React compilado desde el mismo servidor.

---

## 6. Herramientas instaladas vs pendientes

| Herramienta | Estado |
|---|---|
| Python 3.14.7 | ✅ instalado |
| Node.js 24 / npm 11 | ✅ instalado |
| ffmpeg 9.0.1 | ✅ instalado |
| Git 2.55 | ✅ instalado |
| yt-dlp, FastAPI (Python) | 📦 se instalan con pip |
| React + Vite | 📦 se crean con `npm create vite` |

---

## 7. Resumen y decisiones tomadas

| Decisión | Elección |
|---|---|
| Fuente de música | Enlaces (YouTube) con yt-dlp |
| Backend | Python + FastAPI |
| Conversión | ffmpeg |
| Frontend | **React + Vite** (JavaScript, sin TypeScript por ahora) |
| Mejor calidad por defecto | **OPUS original sin recodificar** |
| Formato final | MP3 · M4A · FLAC · OPUS (original) |
| Uso inicial | Local en tu PC; publicación posible en el futuro |

**Siguiente paso:** Fase 1 — crear `backend/` y `frontend/` y hacer que se digan "hola".