export default function Privacy() {
  return (
    <section className="page glass">
      <h1>🔒 Política de privacidad y tratamiento de datos</h1>
      <p className="updated">Última actualización: septiembre de 2026</p>

      <h2>1. Quiénes somos</h2>
      <p>
        MusicGo es una herramienta de descarga de audio de uso personal. Esta
        política explica de forma clara y sencilla qué datos se tratan, por qué y
        cómo el usuario mantiene el control sobre ellos.
      </p>

      <h2>2. Principio general: no recopilamos datos personales</h2>
      <p>
        MusicGo <b>no exige registro, no crea cuentas y no recopila datos
        personales identificables</b> (nombre, correo, IP asociada a un perfil,
        etc.). No utilizamos publicidad ni analítica de terceros que rastree al
        usuario.
      </p>

      <h2>3. Qué información se trata y por qué</h2>
      <ul>
        <li>
          <b>El enlace que pegas:</b> se envía al backend únicamente para localizar
          y descargar el audio solicitado. Se procesa en memoria y <b>no se guarda</b>.
        </li>
        <li>
          <b>Metadatos de la pista</b> (título, artista, duración): se obtienen de las
          APIs públicas de YouTube (oEmbed) y del propio reproductor, solo con la
          finalidad de nombrar y descargar el archivo.
        </li>
        <li>
          <b>Archivos generados:</b> los audios se almacenan de forma temporal en el
          servidor durante la descarga y <b>se eliminan automáticamente</b> al terminar
          (o como máximo tras 24 h de no uso).
        </li>
        <li>
          <b>Consentimiento de cookies:</b> la preferencia (aceptar / solo necesarias)
          se guarda <b>en tu propio navegador</b> (localStorage) y solo sirve para no
          volver a mostrarte el aviso. Nunca sale de tu dispositivo.
        </li>
      </ul>

      <h2>4. Cookies</h2>
      <p>
        MusicGo usa únicamente <b>cookies y almacenamiento local técnicamente
        necesarios</b> para que la aplicación funcione (por ejemplo, recordar tu
        consentimiento). No usamos cookies de marketing ni de seguimiento
        entre sitios.
      </p>

      <h2>5. Terceros implicados</h2>
      <p>
        Para confirmar metadatos y obtener la pista se realizan peticiones a
        YouTube y SoundCloud mediante la herramienta de código abierto
        <i> yt-dlp</i>. Estas peticiones pueden exponer la dirección IP del
        servidor donde corre MusicGo a dichas plataformas, conforme a sus propias
        políticas de privacidad. No transferimos datos personales tuyos a terceros.
      </p>

      <h2>6. Archivado de cookies (opcional)</h2>
      <p>
        Si colocas un archivo <code>cookies.txt</code> en la carpeta del backend,
        MusicGo puede acceder a contenido privado que te corresponda. Ese archivo
        es sensible: <b>no lo compartas ni lo subas nunca</b> a un repositorio público.
      </p>

      <h2>7. Tus derechos</h2>
      <p>
        Al no almacenar datos personales, no hay perfiles que rectificar o borrar:
        el tratamiento es cero. Puedes eliminar en cualquier momento el
        consentimiento guardado en tu navegador desde los ajustes del mismo.
      </p>

      <h2>8. Contacto</h2>
      <p>
        Para cualquier duda sobre esta política, escribe al responsable del
        proyecto (la persona que ejecuta MusicGo en su propio equipo).
      </p>
    </section>
  );
}