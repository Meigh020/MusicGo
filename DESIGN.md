# Diseño — MusicGo 2.0

<!-- impeccable:design-schema 1 -->
<!-- seed:2ae5cb78f0d22894 -->

## Contrato de dirección

**Mundo elegido:** *Mosaico denso japonés* — web utilitaria nipona: papel claro, tipografía
pequeña y compacta, módulos separados por reglas de un píxel, rojo de señal para lo accionable y
densidad de información alta. No es decoración japonesa: es una forma de ordenar.

**Modo:** Operate. La navegación y los controles son convencionales (barra superior, pestañas,
botones, tablas). El mundo aporta solo tipografía, paleta, densidad y un gesto firma.

**Gesto firma:** mosaico de módulos con reglas capilares, pestaña roja de 5 px en cada cabecera y
raíl de progreso segmentado (tics rojos). Todo lo demás se subordina a eso.

**Anti-referencias:** glassmorphism, degradados difusos, tarjetas redondeadas flotantes, tipografía
gigante, emojis como iconos de sección, banners que tapan la interfaz.

## Paleta

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--paper` | `#eff1ee` | `#0f100e` | Fondo de página |
| `--surface` | `#fafbf9` | `#171814` | Módulos, campos, barra |
| `--surface-2` | `#e9ebe6` | `#1f211b` | Cabeceras de módulo, vetos |
| `--surface-3` | `#dde0da` | `#282b23` | Rellenos de miniaturas |
| `--ink` | `#14150f` | `#ecede5` | Texto principal, bordes fuertes |
| `--ink-2` | `#3b3e34` | `#c9ccbe` | Texto secundario |
| `--muted` | `#5f6357` | `#969b8c` | Metadatos (≥ 4.5:1) |
| `--hair` / `--hair-2` | `#cfd3c9` / `#aeb3a5` | `#2e3128` / `#494d41` | Reglas de 1 px |
| `--red` | `#c62d22` | `#ff5a48` | Acción, alerta, foco |
| `--red-2` | `#a02218` | `#ff7c6d` | Hover del rojo |
| `--red-wash` | `#fae9e6` | `#2b1512` | Fondo de estado activo |
| `--ok` / `--warn` / `--err` | `#1c6b45` / `#8a5a12` / `#b3261c` | `#57c08c` / `#e0ac55` / `#ff7a6b` | Estados |

El rojo solo marca lo que se puede pulsar, lo que está activo o lo que falla. Nunca es decorativo.
En oscuro el masthead se invierte (panel claro sobre página negra) para conservar el gesto de
"portada impresa".

## Tipografía

- **Zen Kaku Gothic New** (400/500/700/900), autoalojada en `src/assets/fonts/`. UI y lectura.
- **Barlow Condensed** (500/600/700), autoalojada. Rótulos, cifras, botones, etiquetas y navegación.
- Base 14 px, cuerpo secundario 12–13 px, micro-rótulos 11 px (suelo de legibilidad).
- Cifras siempre `font-variant-numeric: tabular-nums`; títulos en mayúsculas con `letter-spacing`
  negativa (-0.015em) y `line-height` 0.88–0.92.
- Iconos: Bootstrap Icons empaquetado con Vite (sin CDN), tamaño 13–15 px.

## Retícula

- Contenedor 1320 px, relleno lateral 14 px (8 px en móvil).
- Tablero de 12 columnas con `gap: 8px`; módulos `span-4/5/7/8/12` que pasan a ancho completo
  por debajo de 1060 px.
- Módulo: cabecera de 27 px (`surface-2`, regla inferior) + cuerpo con 12 px de relleno y 10 px
  entre bloques. Radio 0 en todo. Sombras solo en avisos flotantes.
- Barra superior fija de 46 px, borde inferior de 1 px, pestañas con subrayado rojo activo.
- Reproductor fijo de 60 px, borde superior rojo de 2 px, oculto hasta que hay pista.

## Componentes

- **Masthead** (`/`): titular condensado, párrafo y línea meta con regla roja; cifras de archivo a
  la derecha separadas por reglas verticales. Sin "eyebrow" sobre el titular.
- **PageHead** (`/cola`, `/biblioteca`): h1 condensado, descripción, línea meta (kicker) debajo y
  estadísticas alineadas al borde derecho; borde inferior de 2 px.
- **Ficha**: miniatura 76 px, título, artista, duración y tamaño; campos de metadatos; rejilla de
  formatos 2×2 con método y tamaño; nota de calidad; acciones.
- **Resultados**: filas de 4 columnas (índice, miniatura 46×34, texto, acciones), lista con scroll
  interno de 452 px máximo, acciones al 55 % de opacidad que suben a 1 al hover/foco.
- **Cola**: filas editables (título + formato; artista + archivo), etiqueta de estado, tamaño real o
  estimado, raíl por pista; acciones de previsualizar, analizar, descargar, mover y quitar.
- **Biblioteca**: tabla densa con miniatura, formato, tamaño, fecha, fuente y acciones; filtros por
  texto y formato, orden por fecha/título/tamaño. Por debajo de 760 px la tabla se reordena como
  fichas de dos filas mediante `grid-template-areas` (sin scroll horizontal y con acciones a la
  vista).
- **Reproductor**: miniatura, título/artista, etiqueta PREVIEW/ARCHIVO, play, tiempo, seek, volumen y
  cerrar. Previews y descargas usan `blob:` locales.
- **Avisos**: cola de toasts abajo a la derecha, borde izquierdo de color según tipo, con acción
  opcional (REPRODUCIR, IR A LA COLA) y cierre manual.

## Estados y movimiento

- Hover: cambio de fondo o borde en ≤ 0.12 s; nunca desplazamientos.
- Entrada de página: 0.18 s de opacidad + 3 px; toasts 0.16 s desde la derecha.
- Progreso: raíl segmentado con `repeating-linear-gradient` (firma), transición de anchura 0.25 s.
- `prefers-reduced-motion`: se anulan animaciones y transiciones.

## Voz y microcopy

Español directo, sin hype ni signos de admiración. Frases cortas, verbos en imperativo para las
acciones ("Descargar", "A la cola", "Vaciar"), estados en una palabra en mayúsculas. Se explica lo
que sorprende: tamaños estimados, rescate vía SoundCloud, permiso de descargas múltiples.

## Accesibilidad

- Foco visible rojo de 2 px en todos los controles; `aria-label` en botones de icono.
- Contraste AA verificado en ambos temas; suelo tipográfico de 11 px para texto funcional y 12 px
  para cuerpo.
- Formularios con `label` visible u oculto (`sr-only`), grupos de formato con `role="radiogroup"`.
- Barrido de `impeccable detect` sin infracciones en `/`, `/cola`, `/biblioteca`, `/privacidad` y
  `/términos` (0 fallos; el único aviso es el raíl segmentado, que es el gesto firma).
- Responsive real a 390 px: sin desbordamiento horizontal; cola y reproductor siguen siendo usables.

## No hacer

- Volver al vidrio, a los degradados de fondo o a los iconos emoji de sección.
- Subir la base tipográfica por encima de 15 px: la densidad es la identidad.
- Introducir radios > 2 px, sombras difusas o tarjetas flotantes.
- Usar el rojo como color de superficies grandes: es señal, no fondo.
- Añadir un banner de cookies a pantalla completa: el aviso vive en el pie y en las páginas legales.
