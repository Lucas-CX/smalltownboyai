import { m } from '@/paraglide/messages.js';

export function DanceTrend() {
  return (
    <section className="dance-trend" aria-labelledby="dance-trend-heading">
      <h2 id="dance-trend-heading">{m['dance.trend.title']()}</h2>
      <p>{m['dance.trend.body']()}</p>
      <div className="dance-trend-notes">
        <article>
          <h3>{m['dance.trend.version_title']()}</h3>
          <p>{m['dance.trend.version_body']()}</p>
        </article>
        <article>
          <h3>{m['dance.trend.sample_title']()}</h3>
          <p>{m['dance.trend.sample_body']()}</p>
        </article>
      </div>
      <a href="#examples">{m['dance.examples.jump']()} ↗</a>
    </section>
  );
}

export function DanceClosingCta() {
  return (
    <section className="dance-trend dance-closing">
      <h2>{m['dance.cta.title']()}</h2>
      <p>{m['dance.cta.body']()}</p>
      <a href="#studio">{m['dance.cast']()} ↗</a>
    </section>
  );
}
