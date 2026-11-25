export default function Module({
  id,
  title,
  right = null,
  className = "",
  bodyClass = "",
  children,
}) {
  return (
    <section className={`mod ${className}`}>
      <header className="mod-head">
        <span className="mod-tab" aria-hidden="true" />
        <h2 className="mod-title">{title}</h2>
        {right ? <div className="mod-right">{right}</div> : null}
        <span className="mod-id">{id}</span>
      </header>
      <div className={`mod-body ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function Rail({ percent = 0, label = "Progreso", className = "" }) {
  const safe = Math.min(100, Math.max(0, Number(percent) || 0));
  return (
    <div
      className={`rail ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(safe)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="rail-fill" style={{ width: `${safe}%` }} />
    </div>
  );
}
