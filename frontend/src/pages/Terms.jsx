export default function Terms() {
  return (
    <section className="page glass">
      <h1>📜 Términos y condiciones</h1>
      <p className="updated">Última actualización: septiembre de 2026</p>

      <h2>1. Aceptación</h2>
      <p>
        Al usar MusicGo aceptas estos términos. Si no estás de acuerdo, no uses
        la aplicación.
      </p>

      <h2>2. Uso responsable del servicio</h2>
      <ul>
        <li>
          MusicGo es una herramienta <b>técnica</b> para obtener audio.{" "}
          <b>Eres responsable del contenido que descargas.</b>
        </li>
        <li>
          Solo debes descargar contenido <b>propio</b>, <b>libre de derechos</b>{" "}
          o con <b>permiso del titular</b> de los derechos de autor.
        </li>
        <li>
          Descargar contenido protegido sin autorización puede infringir la
          legislación de tu país y los términos de servicio de las plataformas.
          MusicGo no se hace responsable del uso que se haga de ella.
        </li>
      </ul>

      <h2>3. El servicio tal cual</h2>
      <p>
        MusicGo se ofrece <b>«tal cual»</b>, sin garantías de disponibilidad,
        exactitud o continuidad. Las plataformas de origen pueden cambiar sus
        medidas técnicas y afectar al funcionamiento sin previo aviso.
      </p>

      <h2>4. Restricciones de edad y recuperación (+18)</h2>
      <p>
        Si una pista está restringida por edad en YouTube, MusicGo intenta
        recuperarla de forma transparente: primero confirma el título y el artista
        vía la API pública oEmbed de YouTube y, si procede, busca la versión
        oficial en SoundCloud. El usuario ve siempre un aviso de lo ocurrido y de
        la fuente alternativa utilizada. Solo debes descargar contenido que tengas
        derecho a obtener.
      </p>

      <h2>5. Privacidad</h2>
      <p>
        En <a href="/privacidad">Política de privacidad</a> se explica el
        tratamiento de datos: resumidamente, no recopilamos datos personales y
        los archivos temporales se eliminan automáticamente.
      </p>

      <h2>6. Propiedad intelectual</h2>
      <p>
        MusicGo es un proyecto de código abierto para uso personal. El nombre y
        los distintivos de la aplicación pertenecen a su desarrollador. Los
        contenidos descargados conservan los derechos de sus respectivos autores.
      </p>

      <h2>7. Limitación de responsabilidad</h2>
      <p>
        En la máxima medida permitida por la ley, el desarrollador no será
        responsable de daños derivados del uso de la aplicación, ni de la pérdida
        de archivos, ni del mal uso del contenido descargado.
      </p>

      <h2>8. Cambios en estos términos</h2>
      <p>
        Podemos actualizar estos términos; la versión vigente estará siempre
        disponible en esta página con su fecha de actualización.
      </p>
    </section>
  );
}