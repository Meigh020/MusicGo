export default function PageHead({ kicker, title, description, stats = null }) {
  return (
    <section className="page-head">
      <div className="page-head-copy">
        <h1>{title}</h1>
        <p>{description}</p>
        {kicker ? (
          <div className="page-kicker">
            <span className="mast-rule" aria-hidden="true" />
            {kicker}
          </div>
        ) : null}
      </div>
      {stats ? <div className="page-stats">{stats}</div> : null}
    </section>
  );
}

export function Stat({ value, label }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
