import { useEffect, useState } from "react";
import { Route, Routes, NavLink, Link } from "react-router-dom";
import DownloadForm from "./components/DownloadForm.jsx";
import QueueForm from "./components/QueueForm.jsx";
import CookieBanner from "./components/CookieBanner.jsx";
import Privacy from "./pages/Privacy.jsx";
import Terms from "./pages/Terms.jsx";

const THEME_KEY = "musicgo-theme";

export default function App() {
  const [theme, setTheme] = useState(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      return stored === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  // Aplica el tema al <html> (data-theme) y lo persiste
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* sin almacenamiento: ignorar */
    }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <div className="app">
      <div className="blobs" aria-hidden="true">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="blob blob-4" />
      </div>

      <div className="content">
        <nav className="nav glass">
          <Link to="/" className="brand">
            <em>🎵</em> MusicGo
          </Link>
          <div className="nav-links">
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              title={theme === "dark" ? "Apagar la luz (modo claro)" : "Encender la luz (modo oscuro)"}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/privacidad" element={<Privacy />} />
          <Route path="/terminos" element={<Terms />} />
        </Routes>
      </div>

      <footer className="footer">
        <p>
          Revisa las reglas de {" "}
          <Link to="/privacidad">Privacidad</Link> y{" "}
          <Link to="/terminos">Términos</Link>
        </p>
      </footer>

      <CookieBanner />
    </div>
  );
}

function Home() {
  const [mode, setMode] = useState("simple");
  return (
    <>
      <header className="hero">
        <h1>Descarga música en la mejor calidad</h1>
        <p>
          Pega un enlace de YouTube, elige formato y descarga:{" "}
          <b>OPUS</b> (original) / <b>MP3</b> / <b>M4A</b> / <b>FLAC</b>
        </p>
      </header>

      <div className="mode-tabs" role="tablist" aria-label="Modo de descarga">
        <button
          role="tab"
          aria-selected={mode === "simple"}
          className={mode === "simple" ? "active" : ""}
          onClick={() => setMode("simple")}
        >
          Modo Simple
        </button>
        <button
          role="tab"
          aria-selected={mode === "queue"}
          className={mode === "queue" ? "active" : ""}
          onClick={() => setMode("queue")}
        >
          Modo multiple
        </button>
      </div>

      {mode === "simple" ? <DownloadForm /> : <QueueForm />}
    </>
  );
}