import { useState } from "react";
import { Link } from "react-router-dom";

const STORAGE_KEY = "musicgo_consent";

export default function CookieBanner() {
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === null;
    } catch {
      return true;
    }
  });

  function decide(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* almacenamiento no disponible */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="cookie-banner glass" role="dialog" aria-label="Aviso de cookies">
      <p>
        <strong>🍪 Aviso de cookies</strong>
        <br />
        MusicGo <b>no recopila datos personales</b> ni crea cuentas. Solo usamos
        almacenamiento local de tu navegador para recordar tu consentimiento y
        cookies técnicas necesarias para el funcionamiento. Lee nuestra{" "}
        <Link to="/privacidad">Política de privacidad</Link> y nuestros{" "}
        <Link to="/terminos">Términos y condiciones</Link>.
      </p>
      <div className="cookie-actions">
        <button className="btn" onClick={() => decide("accepted")}>
          Aceptar
        </button>
        <button className="btn btn-ghost" onClick={() => decide("rejected")}>
          Solo necesarias
        </button>
      </div>
    </div>
  );
}