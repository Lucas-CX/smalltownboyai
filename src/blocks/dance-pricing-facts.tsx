import { envConfigs } from '@/config';
import {
  DANCE_PRICING_REVIEWED_AT,
  danceCreditCost,
  dancePlans,
} from '@/lib/dance-plans';
import { danceResolutions } from '@/lib/dance-settings';
import { m } from '@/paraglide/messages.js';

export function DancePricingFacts() {
  return (
    <section
      aria-labelledby="pricing-current-facts"
      data-pricing-reviewed={DANCE_PRICING_REVIEWED_AT}
      className="my-6 max-w-3xl rounded-xl border p-4 text-sm leading-relaxed md:p-5"
    >
      <h2
        id="pricing-current-facts"
        className="text-lg font-semibold [overflow-wrap:anywhere]"
      >
        {m['dance.pricing_snapshot.title']({ name: envConfigs.app_brand })}
      </h2>
      <p className="mt-3">
        {m['dance.pricing_snapshot.summary']({
          packs: dancePlans
            .map(
              (plan) =>
                `$${(plan.cents / 100).toFixed(2)} USD / ${m['dance.pack.video_count']({ count: plan.videos })}`
            )
            .join(' · '),
        })}
      </p>
      <table className="my-4 w-full border-collapse text-left">
        <thead>
          <tr>
            <th scope="col" className="border-b py-2 pr-4">
              {m['dance.pricing_snapshot.resolution']()}
            </th>
            <th scope="col" className="border-b py-2">
              {m['dance.pricing_snapshot.credits']()}
            </th>
          </tr>
        </thead>
        <tbody>
          {danceResolutions.map((resolution) => (
            <tr key={resolution}>
              <th scope="row" className="border-b py-2 pr-4 font-normal">
                {resolution.toLowerCase()}
              </th>
              <td className="border-b py-2">{danceCreditCost(resolution)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="font-semibold">
        {m['dance.pricing_snapshot.hd_question']({
          price: (dancePlans[0].cents / 100).toFixed(2),
        })}
      </h3>
      <p className="mt-2">
        {m['dance.pricing_snapshot.hd_answer']({
          credits: dancePlans[0].credits,
          cost720: danceCreditCost('720P'),
          cost1080: danceCreditCost('1080P'),
        })}
      </p>
      <p className="dance-muted mt-3">
        {m['dance.pricing_snapshot.reviewed']({
          date: DANCE_PRICING_REVIEWED_AT,
        })}
      </p>
    </section>
  );
}
