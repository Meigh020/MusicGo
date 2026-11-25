# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Un único usuario: el dueño del proyecto, en su PC con Windows, en uso estrictamente personal. No hay cuentas, ni sesiones, ni multiusuario. Trabaja en sesiones cortas: pega enlaces (o busca por nombre), elige formato y archiva canciones en su biblioteca local. Puede dejar una cola larga descargando mientras hace otra cosa.

## Product Purpose

MusicGo convierte enlaces de YouTube en archivos de audio bien etiquetados y listos para archivar, sin subir nada a la nube y sin recodificar cuando no hace falta. El éxito es: abrir la app, encontrar la canción en segundos, descargarla en la mejor calidad posible y saber exactamente qué archivo quedó y dónde.

## Positioning

La calidad la pone la fuente, no la conversión: MusicGo conserva el Opus original bit a bit cuando el destino es OPUS y lo dice con honestidad (OPUS = original; MP3/M4A/FLAC = conversiones de compatibilidad). A eso se suma el rescate transparente de pistas bloqueadas (+18 / Music Premium) vía SoundCloud, avisando siempre de que la fuente es una copia de un tercero.

## Operating Context

- Windows, desarrollo local con `dev.bat` (backend FastAPI en 8000, frontend Vite en 5173).
- Requiere Python 3.12+, Node 20+ y ffmpeg en PATH.
- Descargas temporales en `backend/downloads/`; cookies opcionales en `backend/cookies.txt`.
- El uso previsto es contenido propio o con licencia; se respetan los términos de las plataformas.
- No hay CI, tests ni lint configurados. La verificación es manual end-to-end.

## Capabilities and Constraints

- Formatos: OPUS (original, por defecto, sin recodificar), MP3 320k CBR, M4A (AAC original si la fuente lo es), FLAC.
- Modos: Simple (una pista) y Cola (varias URLs, persistente en localStorage, editable por ítem).
- Metadatos: título y artista editables, incrustados en el archivo (ID3 / Vorbis Comments / iTunes) + carátula cuando el contenedor la admite (Ogg Opus no).
- Flujo de rescate: detecta age-gate o bloqueo Music Premium/members-only, obtiene título/artista vía oEmbed de YouTube y descarga desde SoundCloud; marca el resultado como rescatado.
- 100% local: no hay backend remoto, ni telemetría, ni cuentas.
- Nuevo en 2.0: búsqueda por nombre en YouTube, reproductor integrado con mini-player, biblioteca/historial local, importación de playlists, progreso por canción con cancelación y metadatos extendidos.
- Restricción técnica conocida: el navegador pide permiso para descargas múltiples; no se puede conceder por API.
- Despliegue público no previsto: el motor necesita Python + ffmpeg + IP residencial; el alojamiento compartido tipo PHP no es viable.

## Brand Commitments

- Nombre: MusicGo. Interfaz y textos en español, con voz directa y sin hype.
- El aviso de uso responsable y privacidad se mantiene presente pero discreto (pie y páginas legales), no como banner que tape la interfaz.
- Los nombres de formato (OPUS, MP3, M4A, FLAC) y la filosofía de calidad son parte de la identidad y no se renombran.

## Evidence on Hand

- Ninguna testimonial, cliente, métrica o captura de marketing real. No inventarlas.
- URL de prueba end-to-end: `https://www.youtube.com/watch?v=dQw4w9WgXcQ` (Rick Astley, 213 s; OPUS 3.29 MB, MP3 8.55 MB, M4A 8.70 MB, FLAC 45 MB).
- Capturas y datos de tamaño pueden generarse desde la app real durante el trabajo de diseño.

## Product Principles

1. **La fuente manda.** Nunca prometer calidad que la conversión no puede dar; el formato recomendado es el que no recodifica.
2. **Transparencia radical.** Si algo se rescató, se convirtió o se estimó, el usuario lo sabe sin buscarlo.
3. **Cero fricción.** Pegar, buscar o arrastrar debe llevar a descargar en el menor número de decisiones posible.
4. **Local y privado por defecto.** Nada sale de la máquina; el historial y la cola viven en el navegador.
5. **El archivo importa.** Un nombre y unos tags correctos valen tanto como el audio; la biblioteca debe reflejarlo.

## Accessibility & Inclusion

- Navegación completa por teclado, foco visible y etiquetas accesibles en todos los controles.
- Contraste AA en ambos temas; respetar `prefers-reduced-motion`.
- Responsive real de 360 px a escritorio ancho; la cola y el reproductor deben seguir siendo usables en móvil.
