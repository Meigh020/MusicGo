import { useEffect, useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import TopBar from "./components/TopBar.jsx";
import Footer from "./components/Footer.jsx";
import DownloadPage from "./pages/DownloadPage.jsx";
import QueuePage from "./pages/QueuePage.jsx";
import LibraryPage from "./pages/LibraryPage.jsx";
import Privacy from "./pages/Privacy.jsx";
import Terms from "./pages/Terms.jsx";
import { ToastProvider } from "./context/ToastContext.jsx";
import { LibraryProvider } from "./context/LibraryContext.jsx";
import { PlayerProvider, usePlayer } from "./context/PlayerContext.jsx";
import { QueueProvider } from "./context/QueueContext.jsx";

const THEME_KEY = "musicgo-theme";

function getInitialTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* sin almacenamiento */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* sin almacenamiento */
    }
  }, [theme]);

  const toggleTheme = () => setTheme((value) => (value === "dark" ? "light" : "dark"));

  return (
    <ToastProvider>
      <LibraryProvider>
        <PlayerProvider>
          <QueueProvider>
            <Shell theme={theme} onToggleTheme={toggleTheme} />
          </QueueProvider>
        </PlayerProvider>
      </LibraryProvider>
    </ToastProvider>
  );
}

function Shell({ theme, onToggleTheme }) {
  const location = useLocation();
  const { current } = usePlayer();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);

  return (
    <div className={`app ${current ? "with-player" : ""}`}>
      <TopBar theme={theme} onToggleTheme={onToggleTheme} />
      <main className="content">
        <Routes>
          <Route path="/" element={<DownloadPage />} />
          <Route path="/cola" element={<QueuePage />} />
          <Route path="/biblioteca" element={<LibraryPage />} />
          <Route path="/privacidad" element={<Privacy />} />
          <Route path="/terminos" element={<Terms />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

function NotFound() {
  return (
    <section className="mod">
      <header className="mod-head">
        <span className="mod-tab" aria-hidden="true" />
        <h2 className="mod-title">Error 404</h2>
        <span className="mod-id">—</span>
      </header>
      <div className="mod-body">
        <p className="lead">Esa dirección no existe en MusicGo.</p>
        <a className="btn btn-ghost" href="/">
          Volver al inicio
        </a>
      </div>
    </section>
  );
}
