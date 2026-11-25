import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span className="footer-brand">
          <span className="brand-mark" aria-hidden="true" /> MUSICGO 2.0
        </span>
        <span>Uso personal · descarga solo contenido propio, libre o con permiso.</span>
        <span className="footer-links">
          <Link to="/privacidad">Privacidad</Link>
          <Link to="/terminos">Términos</Link>
          <span className="footer-sep" aria-hidden="true">
            /
          </span>
          <span>Los datos viven en tu navegador</span>
        </span>
      </div>
    </footer>
  );
}
