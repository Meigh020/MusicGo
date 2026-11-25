import { useEffect, useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { useQueue } from "../context/QueueContext.jsx";

export default function TopBar({ theme, onToggleTheme }) {
  const { pendingCount, running } = useQueue();
  const [online, setOnline] = useState(null);

  useEffect(() => {
    let alive = true;
    async function check() {
      try {
        const res = await fetch("/api/progress", { cache: "no-store" });
        if (alive) setOnline(res.ok);
      } catch {
        if (alive) setOnline(false);
      }
    }
    check();
    const timer = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand" aria-label="MusicGo, inicio">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">MusicGo</span>
          <span className="brand-ver">2.0</span>
        </Link>

        <nav className="nav" aria-label="Navegación principal">
          <NavLink to="/" end>
            Descargar
          </NavLink>
          <NavLink to="/cola">
            Cola
            {pendingCount > 0 ? <span className="nav-count">{pendingCount}</span> : null}
          </NavLink>
          <NavLink to="/biblioteca">Biblioteca</NavLink>
        </nav>

        <div className="topbar-right">
          <span
            className={`status ${online === false ? "off" : ""} ${running ? "busy" : ""}`}
            title={online === false ? "El backend no responde en el puerto 8000" : "Backend local activo"}
          >
            <span className="status-dot" aria-hidden="true" />
            {running ? "DESCARGANDO" : online === false ? "SIN BACKEND" : "LOCAL"}
          </span>
          <button
            type="button"
            className="icon-btn theme-btn"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
          >
            <i className={`bi ${theme === "dark" ? "bi-sun" : "bi-moon-stars"}`} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
