import { dancePlans } from './dance-plans';

// Unknown authenticated balances must never be presented as zero balances.
export function danceUpfrontQuote(
  requiredCredits: number,
  balance: number | null
) {
  if (balance === null) return null;
  const offer = dancePurchaseOffer(requiredCredits, balance);
  return {
    ...offer,
    cents: offer.plan?.cents ?? 0,
    remaining: offer.available + (offer.plan?.credits ?? 0) - requiredCredits,
  };
}

// Presentation only. The server still verifies and consumes the real balance.
export function dancePurchaseOffer(requiredCredits: number, balance = 0) {
  if (!Number.isFinite(requiredCredits) || requiredCredits <= 0)
    throw new Error('Invalid credit requirement');
  const available = Number.isFinite(balance) ? Math.max(0, balance) : 0;
  const shortfall = Math.max(0, requiredCredits - available);
  const plan = shortfall
    ? [...dancePlans]
        .filter((candidate) => candidate.credits >= shortfall)
        .sort((a, b) => a.cents - b.cents)[0]
    : undefined;
  return { available, shortfall, plan, canContinue: shortfall === 0 };
}
