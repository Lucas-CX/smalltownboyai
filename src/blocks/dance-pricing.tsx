import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { useSession } from '@/core/auth/client';
import { Link, useRouter } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { apiGet, apiPost } from '@/lib/api-client';
import { browserUuid } from '@/lib/browser-uuid';
import { danceErrorReason, trackDance } from '@/lib/dance-analytics';
import { danceFlowId, flushDanceFunnel } from '@/lib/dance-funnel-client';
import { danceCreditCost, dancePlans } from '@/lib/dance-plans';
import {
  clearPurchaseIntent,
  readPurchaseIntent,
  savePurchaseIntent,
} from '@/lib/dance-purchase-intent';
import { dancePurchaseOffer } from '@/lib/dance-purchase-offer';
import { type DanceResolution } from '@/lib/dance-settings';
import { m } from '@/paraglide/messages.js';
import { getLocale, localizeHref } from '@/paraglide/runtime.js';
import { DancePricingFacts } from '@/blocks/dance-pricing-facts';
import { LocaleSelector } from '@/components/locale-selector';
import { Button } from '@/components/ui/button';

import '@/styles/dance.css';

const DanceDialog = lazy(() =>
  import('@/components/dance-dialog').then((module) => ({
    default: module.DanceDialog,
  }))
);
export function DancePricing({
  standalone = false,
  forGeneration = false,
  requiredCredits = 150,
  resolution = '720P',
  onContinue,
  beforeCheckout,
}: {
  standalone?: boolean;
  forGeneration?: boolean;
  requiredCredits?: number;
  resolution?: DanceResolution;
  onContinue?: () => void;
  beforeCheckout?: () => Promise<void>;
}) {
  const previewOnly = envConfigs.preview_only === 'true';
  const authSession = useSession();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const session = {
    ...authSession,
    data: hydrated ? authSession.data : null,
    isPending: !hydrated || authSession.isPending,
  };
  const router = useRouter();
  const [pack, setPack] = useState<(typeof dancePlans)[number] | null>(null);
  const keys = useRef<Record<string, string>>({});
  const selectionLock = useRef(false);
  const checkoutLock = useRef(false);
  const resumeRead = useRef(false);
  const intentOwner = useRef<string | undefined>(undefined);
  const [selectionError, setSelectionError] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);
  const [resumeResolution, setResumeResolution] = useState<DanceResolution>();
  useEffect(() => {
    if (session.isPending) return;
    const owner = session.data?.user.id;
    if (intentOwner.current && intentOwner.current !== owner) {
      setPack(null);
      setResumeResolution(undefined);
      keys.current = {};
      clearIntent();
    }
    intentOwner.current = owner;
  }, [session.isPending, session.data?.user.id]);
  useEffect(() => {
    if (
      !standalone ||
      session.isPending ||
      !session.data?.user ||
      resumeRead.current
    )
      return;
    if (
      new URLSearchParams(window.location.search).get('purchase') !== 'resume'
    )
      return;
    resumeRead.current = true;
    try {
      const intent = readPurchaseIntent(sessionStorage, session.data.user.id);
      if (!intent) {
        setSelectionError(true);
        return;
      }
      keys.current[intent.packId] = intent.requestKey;
      setResumeResolution(intent.resolution);
      setPack(dancePlans.find((plan) => plan.id === intent.packId) || null);
      trackDance('dance_purchase_restored', {
        pack_id: intent.packId,
        resolution: intent.resolution,
      });
    } catch {
      setSelectionError(true);
    }
  }, [standalone, session.isPending, session.data?.user.id]);
  function clearIntent() {
    try {
      clearPurchaseIntent(sessionStorage);
    } catch {
      /* optional cleanup */
    }
    if (
      new URLSearchParams(window.location.search).get('purchase') === 'resume'
    ) {
      const url = new URL(window.location.href);
      url.searchParams.delete('purchase');
      window.history.replaceState(
        null,
        '',
        url.pathname + url.search + url.hash
      );
    }
  }
  const settings = useQuery({
    queryKey: ['dance-credits', session.data?.user.id],
    queryFn: () =>
      apiGet<{ balance: number; paymentMode: string }>('/api/dance/credits'),
    enabled: !!session.data?.user,
  });
  const stripeLive = settings.data?.paymentMode === 'stripe-live';
  const stripeTest = settings.data?.paymentMode === 'stripe-test';
  const [moreOpen, setMoreOpen] = useState(false);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const offer = dancePurchaseOffer(requiredCredits, settings.data?.balance);
  const purchase = useMutation({
    mutationFn: (selected: (typeof dancePlans)[number]) =>
      apiPost<{ checkoutUrl?: string }>('/api/dance/credits', {
        packId: selected.id,
        requestKey: (keys.current[selected.id] ||= browserUuid()),
        confirmPreview: true,
        flowId: danceFlowId(),
        locale: getLocale(),
      }),
    onMutate: (selected) =>
      trackDance('begin_checkout', {
        pack_id: selected.id,
        value: selected.cents / 100,
        currency: 'USD',
        payment_mode: settings.data?.paymentMode,
      }),
    onError: (error, selected) => {
      checkoutLock.current = false;
      trackDance('dance_checkout_failed', {
        pack_id: selected.id,
        payment_mode: settings.data?.paymentMode,
        reason: danceErrorReason(error),
      });
    },
    onSuccess: async (result, selected) => {
      clearIntent();
      trackDance('dance_checkout_ready', {
        pack_id: selected.id,
        payment_mode: settings.data?.paymentMode,
      });
      await Promise.race([
        flushDanceFunnel(),
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]);
      window.location.assign(
        result.checkoutUrl || localizeHref('/?resume=1#studio')
      );
    },
  });
  function startCheckout(selected: (typeof dancePlans)[number]) {
    if (
      checkoutLock.current ||
      !session.data?.user ||
      !settings.isSuccess ||
      intentOwner.current !== session.data.user.id
    )
      return;
    checkoutLock.current = true;
    purchase.mutate(selected);
  }
  const names = {
    single: m['dance.pack.single'],
    friends: m['dance.pack.friends'],
    collection: m['dance.pack.collection'],
  };
  const ctaState = session.isPending
    ? 'session_loading'
    : session.data?.user && settings.isError
      ? 'credits_unavailable'
      : session.data?.user && !settings.isSuccess
        ? 'credits_loading'
        : purchase.isPending
          ? 'checkout_pending'
          : savingSelection
            ? 'checkout_pending'
            : 'ready';
  const ctaDisabled = previewOnly || ctaState !== 'ready';
  useEffect(() => {
    if (forGeneration)
      trackDance('dance_purchase_cta_state', {
        stage: 'purchase',
        resolution,
        reason: ctaState,
        pack_id: offer.plan?.id,
      });
  }, [forGeneration, ctaState, resolution, offer.plan?.id]);
  useEffect(() => {
    if (!forGeneration || !ctaRef.current) return;
    const button = ctaRef.current;
    const visible = () =>
      trackDance('dance_purchase_cta_viewed', {
        stage: 'purchase',
        resolution,
        reason: ctaState,
        pack_id: offer.plan?.id,
      });
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some(
            (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5
          )
        ) {
          visible();
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(button);
    return () => observer.disconnect();
  }, [forGeneration, ctaState, resolution, offer.plan?.id]);
  async function selectPlan(selected: (typeof dancePlans)[number]) {
    if (previewOnly) return;
    if (selectionLock.current || checkoutLock.current || session.isPending)
      return;
    selectionLock.current = true;
    setSavingSelection(true);
    setSelectionError(false);
    const selectedFor = session.data?.user.id;
    try {
      await beforeCheckout?.();
      if (intentOwner.current !== selectedFor) return;
      trackDance('dance_pack_selected', {
        pack_id: selected.id,
        payment_mode: settings.data?.paymentMode,
        resolution,
      });
      if (!session.data?.user) {
        savePurchaseIntent(sessionStorage, {
          packId: selected.id,
          resolution,
          requestKey: (keys.current[selected.id] ||= browserUuid()),
        });
        trackDance('dance_login_required', { stage: 'checkout' });
        router.push('/sign-in?callbackUrl=%2Fpricing%3Fpurchase%3Dresume');
        return;
      }
      purchase.reset();
      if (forGeneration) startCheckout(selected);
      else setPack(selected);
    } catch {
      setSelectionError(true);
      trackDance('dance_client_error', {
        stage: 'draft_save',
        reason: 'storage_failed',
      });
    } finally {
      selectionLock.current = false;
      setSavingSelection(false);
    }
  }
  return (
    <section
      id={forGeneration ? undefined : 'pricing'}
      className={`dance-pack-section ${standalone ? 'dance-pricing-page' : ''}`}
    >
      {standalone && (
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/#studio" className="dance-back">
            ← {m['dance.backstudio']()}
          </Link>
          <LocaleSelector variant="pill" className="dance-language-selector" />
        </div>
      )}
      <p className="dance-eyebrow">{m['dance.pricing']()}</p>
      {standalone ? (
        <h1>{m['dance.packtitle']()}</h1>
      ) : (
        <h2>{m['dance.packtitle']()}</h2>
      )}
      {!forGeneration && <p className="dance-muted">{m['dance.packbody']()}</p>}
      {previewOnly && (
        <p className="dance-muted">{m['dance.pricepreview']()}</p>
      )}
      {selectionError && (
        <p role="alert">{m['dance.purchase.restore_error']()}</p>
      )}

      {forGeneration ? (
        <div className="dance-purchase-focused">
          <p className="dance-purchase-context">
            {m['dance.purchase.current']({
              resolution: resolution.toLowerCase(),
            })}
          </p>
          {ctaState === 'credits_unavailable' ? (
            <div role="alert">
              <p>{m['dance.purchase.balance_error']()}</p>
              <Button onClick={() => void settings.refetch()}>
                {m['dance.retry']()}
              </Button>
            </div>
          ) : (
            <>
              <p className="dance-purchase-summary">
                {offer.canContinue
                  ? m['dance.purchase.balance_ready']()
                  : m['dance.purchase.recommended']()}
              </p>
              <Button
                ref={ctaRef}
                className="dance-primary dance-purchase-main"
                disabled={ctaDisabled || (!offer.plan && !offer.canContinue)}
                onClick={() => {
                  if (offer.canContinue && onContinue) {
                    trackDance('dance_purchase_continue_clicked', {
                      resolution,
                    });
                    onContinue();
                  } else if (offer.plan) selectPlan(offer.plan);
                }}
              >
                {ctaDisabled
                  ? m['dance.loading']()
                  : offer.canContinue
                    ? m['dance.purchase.use_balance']()
                    : m['dance.purchase.pay']({
                        price: ((offer.plan?.cents ?? 0) / 100).toFixed(2),
                      })}
              </Button>
              {!ctaDisabled && !offer.canContinue && offer.plan && (
                <p className="dance-purchase-credit-note">
                  {m['dance.purchase.credit_summary']()}
                </p>
              )}
            </>
          )}
          <p className="dance-purchase-trust">{m['dance.purchase.next']()}</p>
          <p className="dance-purchase-trust">
            {m['dance.purchase.delivery']()}
          </p>
          <Link href="/refund-policy" className="dance-purchase-policy">
            {m['dance.refunds']()}
          </Link>
          <details
            open={moreOpen}
            onToggle={(event) => {
              const open = event.currentTarget.open;
              if (open && !moreOpen)
                trackDance('dance_purchase_more_opened', { resolution });
              setMoreOpen(open);
            }}
            className="dance-purchase-alternatives"
          >
            <summary>{m['dance.purchase.more']()}</summary>
            {dancePlans
              .filter(
                (plan) =>
                  plan.credits >= offer.shortfall && plan.id !== offer.plan?.id
              )
              .map((plan) => (
                <div key={plan.id}>
                  <span>
                    {m['dance.pack.video_count']({ count: plan.videos })}
                  </span>
                  <Button
                    disabled={ctaDisabled}
                    onClick={() => selectPlan(plan)}
                  >
                    {m['dance.purchase.pack_price']({
                      price: (plan.cents / 100).toFixed(2),
                    })}
                  </Button>
                </div>
              ))}
          </details>
        </div>
      ) : (
        <>
          <p className="dance-resolution-prices">
            {(['720P'] as const)
              .map(
                (value) =>
                  `${value.toLowerCase()}: ${danceCreditCost(value)} ${m['dance.credits']()}`
              )
              .join(' · ')}
          </p>
          <div className="dance-pack-grid">
            {dancePlans.map((plan) => (
              <article
                key={plan.id}
                className={
                  plan.id === 'friends' ? 'dance-pack-best' : undefined
                }
              >
                {plan.id === 'friends' && (
                  <p className="dance-pack-value">
                    {m['dance.pack.recommended']()}
                  </p>
                )}
                {forGeneration &&
                  plan.id === 'single' &&
                  requiredCredits <= plan.credits && (
                    <p className="dance-pack-starter">
                      {m['dance.purchase.starter']()}
                    </p>
                  )}
                <h3>{names[plan.id]()}</h3>
                <p className="dance-pack-price">
                  ${(plan.cents / 100).toFixed(2)} <small>USD</small>
                </p>
                <p>
                  <strong>
                    {m['dance.pack.video_count']({ count: plan.videos })}
                  </strong>
                </p>
                <p className="dance-muted">{m['dance.pack.format']()}</p>
                <p className="dance-muted">
                  {m['dance.purchase.unitprice']({
                    price: (Math.round(plan.cents / plan.videos) / 100).toFixed(
                      2
                    ),
                  })}
                </p>
                {plan.id !== 'single' && (
                  <p className="dance-pack-savings">
                    {m['dance.pack.savings']({
                      percent: Math.round(
                        (1 -
                          plan.cents /
                            plan.credits /
                            (dancePlans[0].cents / dancePlans[0].credits)) *
                          100
                      ),
                    })}
                  </p>
                )}
                <Button
                  className="dance-primary"
                  disabled={
                    previewOnly ||
                    (forGeneration &&
                      plan.credits + (settings.data?.balance ?? 0) <
                        requiredCredits) ||
                    session.isPending ||
                    savingSelection ||
                    purchase.isPending ||
                    (!!session.data?.user && !settings.isSuccess)
                  }
                  onClick={() => {
                    selectPlan(plan);
                  }}
                >
                  {previewOnly
                    ? m['dance.coming_soon']()
                    : purchase.isPending
                      ? m['dance.loading']()
                      : forGeneration
                        ? m['dance.paygenerate']()
                        : m['dance.buy']()}
                </Button>
                <small>
                  {forGeneration &&
                  plan.credits + (settings.data?.balance ?? 0) < requiredCredits
                    ? m['dance.pack.insufficient']()
                    : m['dance.nosub']()}
                </small>
              </article>
            ))}
          </div>
          <p className="dance-muted">{m['dance.pack.capacitynote']()}</p>
        </>
      )}
      {standalone && <DancePricingFacts />}
      {standalone && (
        <div className="mt-6 max-w-3xl space-y-3 text-sm leading-relaxed">
          <p className="dance-muted">
            {m['dance.pricing_details.cost']({
              resolutions: (['720P'] as const)
                .map(
                  (value) => `${value.toLowerCase()}: ${danceCreditCost(value)}`
                )
                .join(' · '),
            })}
          </p>
          <p className="dance-muted">{m['dance.pricing_details.results']()}</p>
          <p className="dance-muted">{m['dance.pricing_details.failure']()}</p>
          <p className="dance-muted">{m['dance.pricing_details.access']()}</p>
          <nav
            aria-label={m['dance.pricing_details.policies']()}
            className="flex flex-wrap gap-x-5 gap-y-2 underline underline-offset-4"
          >
            <Link href="/refund-policy">{m['dance.refunds']()}</Link>
            <Link href="/terms-of-service">{m['dance.terms']()}</Link>
            <Link href="/privacy-policy">{m['dance.privacy']()}</Link>
            <Link href="/contact">{m['dance.support']()}</Link>
          </nav>
        </div>
      )}
      {forGeneration && stripeTest && (
        <p className="dance-muted">{m['dance.testcheckoutbody']()}</p>
      )}
      {forGeneration && purchase.isError && (
        <p role="alert">{m['dance.actionerror']()}</p>
      )}
      <Suspense fallback={null}>
        {!!pack && (
          <DanceDialog
            open={!!pack}
            onOpenChange={(open) => {
              if (!open && !purchase.isPending) {
                setPack(null);
                clearIntent();
              }
            }}
            className=""
            showCloseButton={!purchase.isPending}
            title={
              !settings.isSuccess
                ? m['dance.loading']()
                : stripeLive
                  ? m['dance.livecheckouttitle']()
                  : stripeTest
                    ? m['dance.testcheckouttitle']()
                    : m['dance.checkouttitle']()
            }
            description={
              !settings.isSuccess
                ? m['dance.loading']()
                : stripeLive
                  ? m['dance.livecheckoutbody']()
                  : stripeTest
                    ? m['dance.testcheckoutbody']()
                    : m['dance.checkoutbody']()
            }
          >
            {resumeResolution && (
              <p>
                {m['dance.purchase.restored']({
                  resolution: resumeResolution.toLowerCase(),
                })}
              </p>
            )}
            <p>
              {m['dance.pack.video_count']({ count: pack.videos })} · $
              {((pack?.cents || 0) / 100).toFixed(2)} USD
            </p>
            <p className="dance-muted">{m['dance.pack.format']()}</p>
            {purchase.isError && <p role="alert">{m['dance.actionerror']()}</p>}
            {settings.isError && (
              <p role="alert">
                {m['dance.purchase.balance_error']()}{' '}
                <button type="button" onClick={() => void settings.refetch()}>
                  {m['dance.retry']()}
                </button>
              </p>
            )}
            <Button
              disabled={
                purchase.isPending || !settings.isSuccess || session.isPending
              }
              onClick={() => pack && startCheckout(pack)}
            >
              {purchase.isPending
                ? m['dance.loading']()
                : stripeLive
                  ? m['dance.livecheckoutconfirm']()
                  : stripeTest
                    ? m['dance.testcheckoutconfirm']()
                    : m['dance.checkoutconfirm']()}
            </Button>
          </DanceDialog>
        )}
      </Suspense>
    </section>
  );
}
