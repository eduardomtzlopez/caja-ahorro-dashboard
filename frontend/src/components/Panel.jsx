// Contenedor de cada visualización: el título expresa el hallazgo, el subtítulo la métrica
export default function Panel({ titulo, subtitulo, children, className = '', alerta = false, nivel }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-cabecera">
        {nivel && <span className="panel-nivel">{nivel}</span>}
        <h2 className={alerta ? 'hallazgo alerta' : 'hallazgo'}>{alerta && <span aria-hidden>▲ </span>}{titulo}</h2>
        {subtitulo && <p className="panel-sub">{subtitulo}</p>}
      </header>
      <div className="panel-cuerpo">{children}</div>
    </section>
  );
}
