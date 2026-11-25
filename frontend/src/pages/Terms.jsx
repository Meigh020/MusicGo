import { Link } from "react-router-dom";

export default function Terms() {
  return (
    <section className="doc">
      <div className="doc-head">
        <h1>Términos</h1>
        <p className="updated">Última actualización: noviembre de 2026 · MusicGo 2.0</p>
      </div>

      <h2>1. Aceptación</h2>
      <p>
        Al usar MusicGo aceptas estos términos. Si no estás de acuerdo, no uses la aplicación.
      </p>

      <h2>2. Uso responsable</h2>
      <ul>
        <li>
          MusicGo es una herramienta <b>técnica</b> para obtener audio.{" "}
          <b>Eres responsable del contenido que descargas.</b>
        </li>
        <li>
          Descarga solo contenido <b>propio</b>, <b>libre de derechos</b> o con{" "}
          <b>permiso del titular</b>.
        </li>
        <li>
          Descargar contenido protegido sin autorización puede infringir la legislación de tu país y
          los términos de servicio de las plataformas. MusicGo no se hace responsable del uso que se
          haga de ella.
        </li>
      </ul>

      <h2>3. El servicio tal cual</h2>
      <p>
        MusicGo se ofrece <b>«tal cual»</b>, sin garantías de disponibilidad, exactitud o
        continuidad. Las plataformas de origen pueden cambiar sus medidas técnicas y afectar al
        funcionamiento sin previo aviso.
      </p>

      <h2>4. Restricciones de edad y rescate (+18)</h2>
      <p>
        Si una pista está restringida por edad o por Music Premium en YouTube, MusicGo intenta
        recuperarla de forma transparente: confirma título y artista vía la API pública oEmbed de
        YouTube y, si procede, busca una copia en SoundCloud. La interfaz avisa siempre de lo
        ocurrido y de la fuente alternativa. Solo debes descargar contenido que tengas derecho a
        obtener.
      </p>

      <h2>5. Calidad y formatos</h2>
      <p>
        La calidad la determina la fuente. OPUS conserva el audio original; MP3, M4A y FLAC son
        conversiones de compatibilidad y no mejoran el sonido. Los tamaños mostrados antes de
        descargar son estimaciones.
      </p>

      <h2>6. Privacidad</h2>
      <p>
        En la <Link to="/privacidad">Política de privacidad</Link> se explica el tratamiento de
        datos: no recopilamos datos personales y los archivos temporales se eliminan
        automáticamente.
      </p>

      <h2>7. Propiedad intelectual</h2>
      <p>
        MusicGo es un proyecto de código abierto para uso personal. El nombre y los distintivos
        pertenecen a su desarrollador. Los contenidos descargados conservan los derechos de sus
        respectivos autores.
      </p>

      <h2>8. Limitación de responsabilidad</h2>
      <p>
        En la máxima medida permitida por la ley, el desarrollador no será responsable de daños
        derivados del uso de la aplicación, ni de la pérdida de archivos, ni del mal uso del
        contenido descargado.
      </p>

      <h2>9. Cambios</h2>
      <p>
        Podemos actualizar estos términos; la versión vigente estará siempre en esta página con su
        fecha de actualización.
      </p>

      <p className="doc-back">
        <Link className="btn btn-ghost" to="/">
          Volver al inicio
        </Link>
      </p>
    </section>
  );
}
