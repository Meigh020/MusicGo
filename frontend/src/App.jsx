import { Route, Routes, NavLink, Link } from "react-router-dom";
import DownloadForm from "./components/DownloadForm.jsx";
import CookieBanner from "./components/CookieBanner.jsx";
import Privacy from "./pages/Privacy.jsx";
import Terms from "./pages/Terms.jsx";

export default function App() {
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
            <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
              Descargar
            </NavLink>
            <NavLink to="/privacidad" className={({ isActive }) => (isActive ? "active" : "")}>
              Privacidad
            </NavLink>
            <NavLink to="/terminos" className={({ isActive }) => (isActive ? "active" : "")}>
              Términos
            </NavLink>
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
          MusicGo · contenido de audio que tengas derecho a descargar ·{" "}
          <Link to="/privacidad">Privacidad</Link> ·{" "}
          <Link to="/terminos">Términos</Link>
        </p>
      </footer>

      <CookieBanner />
    </div>
  );
}

function Home() {
  return (
    <>
      <header className="hero">
        <h1>🎧 Descarga música en la mejor calidad</h1>
        <p>
          Pega un enlace de YouTube, elige formato y descarga:{" "}
          <b>OPUS</b> (original) · <b>MP3</b> · <b>M4A</b> · <b>FLAC</b>
        </p>
        <span className="badge">⚡ Mejor calidad = OPUS original, sin recodificar</span>
      </header>
      <DownloadForm />
    </>
  );
}