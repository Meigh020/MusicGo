# MusicGo — Plan del Proyecto (y mini-tutorial)

Un **descargador de música web** que extrae audio desde enlaces (YouTube, etc.)
y lo convierte a **MP3**, **M4A** y **FLAC**.

> ⚠️ **Uso responsable:** esta herramienta solo debe usarse con contenido propio,
> libre de derechos o con permiso del autor. Descargar música con copyright puede
> violar los términos de servicio de las plataformas y las leyes locales.

---

## 1. ¿Qué vamos a construir?

Una aplicación web que corre en tu PC (y que más adelante podrías publicar).

**Flujo del usuario:**
1. Abre una página web en el navegador (`http://localhost:8000`).
2. Pega un enlace de YouTube.
3. Elige el formato: MP3, M4A o FLAC.
4. Pulsa "Descargar" y el archivo cae en su carpeta de descargas. ✅

---

## 2. Conceptos básicos (para entender el resto)

### ¿Qué es una "aplicación web"?
Es un programa con **dos partes** que conversan entre sí:

```
┌─────────────┐   pide cosas   ┌─────────────┐
│  FRONTEND   │ ─────────────► │   BACKEND   │
│  (lo que    │ ◄───────────── │  (lo que    │
│   ves)      │  da respuestas │   piensa)   │
└─────────────┘                └─────────────┘
```

| Parte | Analogía | Qué hace en MusicGo |
|---|---|---|
| **Frontend** | El **mesero** y el **menú** | Muestra el cuadro para pegar el enlace, los botones de formato y el botón de descarga |
| **Backend** | La **cocina** | Recibe el enlace, descarga el audio, lo convierte a MP3/M4A/FLAC y te lo sirve |

### ¿Por qué "web" si es solo para tu PC?
Porque el navegador es la interfaz más cómoda: no hay que instalar nada para usarla,
se ve bonita sin esfuerzo, y **el mismo backend funciona igual si un día la publicas
en internet**. Solo cambiaría en qué computadora corre.

---

## 3. Arquitectura de MusicGo

```
                        TU PC
┌─────────────────────────────────────────────────────┐
│  NAVEGADOR  ────►  BACKEND (Python)                 │
│  (Frontend)       │                                 │
│                   │  1. Recibe el enlace             │
│                   │  2. Llama a yt-dlp ──► descarga el audio │
│                   │  3. Llama a ffmpeg ──► lo convierte     │
│                   │     a MP3 / M4A / FLAC          │
│                   │  4. Devuelve el archivo al navegador    │
└─────────────────────────────────────────────────────┘
```

### Las piezas del backend

| Herramienta | Qué es | Para qué la usamos |
|---|---|---|
| **Python** | Lenguaje de programación | El cerebro del proyecto. Fácil de leer y aprender |
| **yt-dlp** | Biblioteca Python | Descarga el audio desde YouTube y otros sitios. Es el estándar de la industria |
| **ffmpeg** | Programa externo | Convierte el audio entre formatos (MP3, M4A, FLAC). Lo usan YouTube, Twitch, etc. |
| **Framework web** | Biblioteca Python | Crea el servidor web del backend (le da respuestas al frontend) |

> 🎓 **Concepto: biblioteca vs programa.** Una *biblioteca* (yt-dlp) es código que
> "importas" dentro de tu programa. Un *programa externo* (ffmpeg) es un ejecutable
> que tu programa llama desde la línea de comandos. Ambos los usamos juntos.

### ¿Por qué Python y no JavaScript u otro?
- **yt-dlp solo es bueno en Python**: es la combinación más probada para este caso.
- Python es el lenguaje **más fácil de leer**, ideal para alguien que empieza.
- Hay una comunidad enorme y tutoriales de sobra.

---

## 4. El frontend: tus 3 opciones explicadas

Esta es la decisión pendiente. Te explico cada una en cristiano:

### Opción A — Streamlit (100% Python)
Streamlit es una biblioteca que **genera la página web automáticamente**.
En vez de escribir HTML y CSS, escribes Python y Streamlit dibuja la interfaz.

```python
# Así de simple se ve (ejemplo ilustrativo)
enlace = st.text_input("Pega el enlace de YouTube")
formato = st.selectbox("Formato", ["MP3", "M4A", "FLAC"])
if st.button("Descargar"):
    descargar(enlace, formato)
```

✅ **Ventajas:**
- No necesitas aprender HTML/CSS/JS: todo es Python.
- Resultado bonito "gratis" (botones, campos, temas).
- Tiene botón nativo `st.download_button` para que el archivo baje al navegador.
- Perfecto para hacer un prototipo rápido (semanas → días).

❌ **Desventajas:**
- Menos control del diseño (es más difícil hacer algo "a medida").
- Si algún día quieres una web súper personalizada, tendrías que migrar.

### Opción B — Frontend clásico (HTML + CSS + JavaScript)
Aquí escribes la página "a mano": HTML define el contenido, CSS el estilo
y JS la interacción. Es **lo que se enseña al aprender web de verdad**.

✅ **Ventajas:**
- Aprendes los fundamentos reales de la web (te sirve para todo después).
- Control total del diseño.

❌ **Desventajas:**
- Más trabajo: son 3 lenguajes nuevos + el backend en Python.
- Curva de aprendizaje más alta para llegar al mismo MVP.

### Opción C — Framework moderno (React / Vue)
Framework de JavaScript que usan las empresas para apps grandes.

✅ **Ventajas:** lo más "profesional" que existe hoy.
❌ **Desventajas:** la curva de aprendizaje **más empinada**. Para un MVP de
descarga de música es **excesivo**: añade complejidad sin aportar valor real.

### Comparación rápida

| Criterio | A. Streamlit | B. HTML/CSS/JS | C. React/Vue |
|---|---|---|---|
| Lo que aprendes | Python puro | Fundamentos web | Framework moderno |
| Tiempo hasta el MVP | Días | Semanas | Meses |
| Diseño personalizado | Limitado | Total | Total |
| Dificultad inicial | ⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 5. Mi recomendación

**Empieza con la Opción B — frontend clásico (HTML/CSS/JS)** con este matiz:

1. **Primero, haz el 100% del backend en Python** (FastAPI + yt-dlp + ffmpeg)
   probándolo con una página HTML mínima. Es la parte difícil y la más valiosa.
2. **Después construye el frontend clásico.** Es lo que te dará bases reales de web.

¿Por qué no Streamlit si es más rápido? Porque has dicho que "no sabes nada de web"
y **estás aprendiendo**: la Opción B te enseña lo fundamental y sigue siendo
sencilla. Si prefieres llegar al resultado funcional en el menor tiempo posible,
Streamlit es la alternativa legítima (y podemos migrar el backend intacto después,
porque el backend es el mismo en ambas).

> 💡 Dato clave: el **backend no cambia** entre opciones. Elegir frontend no es
> una apuesta irreversible. Si un día te cansas del clásico, React usa los mismos
> fundamentos de HTML/CSS/JS que ya sabrás.

---

## 6. Plan por fases

### Fase 0 — Preparar el entorno (hoy)
- Instalar Python, Git ya lo tenemos, y ffmpeg.
- Crear la estructura del proyecto y el primer commit.

### Fase 1 — MVP (el "esqueleto" que funciona)
- Backend que recibe un enlace y descarga el audio en **MP3**.
- Frontend mínimo: cuadro de texto + botón + formato MP3.
- Validar de punta a punta: pego enlace → sale MP3. ✅
- Agregar formato **M4A** (es casi gratis con ffmpeg).

### Fase 2 — Formato FLAC y calidad
- Agregar **FLAC** (sin pérdida, archivo más pesado).
- Selector de calidad (por ejemplo: mejor calidad / 128 kbps / 320 kbps para MP3).

### Fase 3 — Pulido
- Progreso de descarga visible en la página.
- Mensajes de error claros (enlace inválido, video privado, sin conexión).
- Diseño con logo y colores de "MusicGo".

### Fase 4 — (Opcional, más adelante) Publicar en internet
- Requiere un servidor (VPS) con mayor capacidad, un dominio y HTTPS.
- Ojo: muchos proveedores en la nube **prohíben** yt-dlp en sus servidores;
  habría que elegir un VPS autónomo (por ejemplo Hetzner, DigitalOcean, Oracle Cloud).
- Se puede automatizar con `systemd` o Docker.

> Empezamos en local y el código ya quedará listo para subir después.

---

## 7. Herramientas que instalaremos

| Herramienta | Para qué |
|---|---|
| **Python 3.12+** | Lenguaje del backend |
| **ffmpeg** | Conversión de audio (MP3/M4A/FLAC) |
| **pip** | Instalador de bibliotecas de Python (viene con Python) |
| **Git** | Control de versiones (ya lo tienes ✅) |
| **VS Code** | Editor de código (recomendado) |
| **yt-dlp + FastAPI** | Bibliotecas Python que instalaremos vía pip |

---

## 8. Resumen en una frase

> **MusicGo = Python (backend) + yt-dlp (descarga) + ffmpeg (convierte) +
> un frontend que tú elegirás (Streamlit, HTML/CSS/JS o React) — corriendo en tu PC.**

**Decisión pendiente para ti:** ¿qué frontend elegimos: **A (Streamlit)**,
**B (HTML/CSS/JS)** o **C (React/Vue)**?