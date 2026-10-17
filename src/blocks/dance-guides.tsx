import { Link } from '@/core/i18n/navigation';
import { m } from '@/paraglide/messages.js';

export function DanceGuides() {
  return (
    <section className="dance-trend" aria-labelledby="dance-guides-heading">
      <h2 id="dance-guides-heading">{m['dance.guides.title']()}</h2>
      <p>{m['dance.guides.description']()}</p>
      <div className="dance-trend-notes">
        <article>
          <h3>
            <Link href="/how-to-make-smalltown-boy-ai-video">
              {m['dance.guides.how']()}
            </Link>
          </h3>
          <p>{m['dance.guides.how_description']()}</p>
        </article>
        <article>
          <h3>
            <Link href="/smalltown-boy-sample">
              {m['dance.guides.sample']()}
            </Link>
          </h3>
          <p>{m['dance.guides.sample_description']()}</p>
        </article>
      </div>
      <p>
        <Link href="/smalltown-boy-generator-comparison">
          {m['dance.guides.compare']()} ↗
        </Link>
      </p>
      <Link href="/guides">{m['dance.guides.all']()} ↗</Link>
    </section>
  );
}
