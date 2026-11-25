import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <section className="doc">
      <div className="doc-head">
        <h1>Privacidad</h1>
        <p className="updated">Última actualización: noviembre de 2026 · MusicGo 2.0</p>
      </div>

      <h2>1. Qué es MusicGo</h2>
      <p>
        MusicGo es una herramienta local de descarga de audio para uso personal. El backend se
        ejecuta en tu propio equipo y la interfaz vive en tu navegador. No hay cuentas, ni
        servidores remotos, ni analítica.
      </p>

      <h2>2. Principio general: no recopilamos datos personales</h2>
      <p>
        MusicGo <b>no exige registro, no crea cuentas y no recopila datos personales
        identificables</b>. No hay publicidad, ni rastreadores de terceros, ni perfiles de usuario.
      </p>

      <h2>3. Qué información se trata y por qué</h2>
      <ul>
        <li>
          <b>El enlace o la búsqueda:</b> se envía al backend local únicamente para localizar y
          descargar el audio. No se guarda en ningún servidor remoto.
        </li>
        <li>
          <b>Metadatos de la pista</b> (título, artista, duración): se obtienen de las APIs públicas
          de YouTube y del propio reproductor, solo para nombrar el archivo y escribir sus tags.
        </li>
        <li>
          <b>Archivos generados:</b> los audios se almacenan temporalmente en{" "}
          <code>backend/downloads/</code> durante la descarga y se eliminan al terminar. La caché de
          vista previa caduca a las 12 horas.
        </li>
        <li>
          <b>Cola e historial:</b> se guardan <b>solo en el almacenamiento local de tu
          navegador</b> (localStorage) para que sobrevivan a una recarga. Nunca salen de tu equipo.
        </li>
        <li>
          <b>Preferencias:</b> tema, volumen y el aviso de descarga múltiple también viven en tu
          navegador.
        </li>
      </ul>

      <h2>4. Cookies y almacenamiento local</h2>
      <p>
        MusicGo no usa cookies de marketing ni de seguimiento. Solo emplea almacenamiento local
        técnicamente necesario para recordar tus preferencias, la cola y la biblioteca. Puedes
        borrarlo en cualquier momento desde los ajustes de tu navegador.
      </p>

      <h2>5. Terceros implicados</h2>
      <p>
        Para confirmar metadatos y obtener la pista se realizan peticiones a YouTube y SoundCloud
        mediante la herramienta de código abierto <i>yt-dlp</i>. Esas peticiones exponen la
        dirección IP de tu equipo a dichas plataformas, conforme a sus propias políticas. No
        transferimos datos tuyos a terceros.
      </p>

      <h2>6. Cookies de plataformas (opcional)</h2>
      <p>
        Si colocas un archivo <code>cookies.txt</code> en la carpeta del backend, MusicGo puede
        acceder a contenido privado que te corresponda. Ese archivo es sensible:{" "}
        <b>no lo compartas ni lo subas nunca</b> a un repositorio público.
      </p>

      <h2>7. Tus derechos</h2>
      <p>
        Al no almacenar datos personales, no hay perfiles que rectificar o borrar. Puedes eliminar
        el historial desde <Link to="/biblioteca">Biblioteca</Link> y limpiar el almacenamiento del
        navegador cuando quieras.
      </p>

      <h2>8. Contacto</h2>
      <p>
        Para cualquier duda sobre esta política, escribe al responsable del proyecto (la persona que
        ejecuta MusicGo en su propio equipo).
      </p>

      <p className="doc-back">
        <Link className="btn btn-ghost" to="/">
          Volver al inicio
        </Link>
      </p>
    </section>
  );
}
