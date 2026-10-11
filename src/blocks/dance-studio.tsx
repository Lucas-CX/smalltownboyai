import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  LockKeyhole,
  Play,
  Plus,
  Upload,
  Video,
} from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { Link, useRouter } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { apiGet, apiPost } from '@/lib/api-client';
import { browserUuid } from '@/lib/browser-uuid';
import {
  createDanceResultObserver,
  danceErrorReason,
  trackDance,
  trackDanceOnce,
} from '@/lib/dance-analytics';
import { castPreview } from '@/lib/dance-cast';
import {
  clearDanceDraft,
  loadDanceDraft,
  saveDanceDraft,
} from '@/lib/dance-draft';
import { danceFaq } from '@/lib/dance-faq';
import { danceFlowId, resetDanceFlow } from '@/lib/dance-funnel-client';
import {
  funnelParamsSchema,
  type FunnelParams,
} from '@/lib/dance-funnel-contract';
import { danceTrendPreview } from '@/lib/dance-media';
import {
  DANCE_PHOTO_ACCEPT,
  DancePhotoError,
  prepareDancePhoto,
} from '@/lib/dance-photo';
import { DANCE_PHOTO_RULE_VERSION } from '@/lib/dance-photo-policy';
import { danceCreditCost, dancePlans } from '@/lib/dance-plans';
import { danceProgress } from '@/lib/dance-progress';
import { danceUpfrontQuote } from '@/lib/dance-purchase-offer';
import {
  danceResolutions,
  loadDanceResolution,
  saveDanceResolution,
  type DanceResolution,
} from '@/lib/dance-settings';
import { readDanceVideoState } from '@/lib/dance-video-state';
import { m } from '@/paraglide/messages.js';
import { getLocale, localizeHref } from '@/paraglide/runtime.js';
import { DancePricing } from '@/blocks/dance-pricing';
import { DanceClosingCta, DanceTrend } from '@/blocks/dance-trend';
import { DanceVideo } from '@/components/dance-video';
import { LocaleSelector } from '@/components/locale-selector';
import { Button } from '@/components/ui/button';

import '@/styles/dance.css';

const DanceDialog = lazy(() =>
  import('@/components/dance-dialog').then((module) => ({
    default: module.DanceDialog,
  }))
);
const SignInForm = lazy(() =>
  import('@/blocks/sign-in-form').then((module) => ({
    default: module.SignInForm,
  }))
);
const SiteUserMenu = lazy(() =>
  import('@/components/site-user-menu').then((module) => ({
    default: module.SiteUserMenu,
  }))
);

type Job = {
  simulation: boolean;
  id: string;
  status: string;
  scenario: string;
  resolution: DanceResolution;
  paymentMode: string;
  errorCode: string | null;
  expired: boolean;
  supportRequested: number;
  providerId: string | null;
  providerCostCents: number | null;
  createdAt: number;
};
const labels: Record<string, () => string> = {
  actionerror: m['dance.actionerror'],
  createerror: m['dance.createerror'],
  filesize: m['dance.filesize'],
  fileformat: m['dance.fileformat'],
  onefile: m['dance.onefile'],
  loading: m['dance.loading'],
  replace: m['dance.replace'],
  remove: m['dance.remove'],
  reading: m['dance.reading'],
  ready: m['dance.ready'],
  needconsent: m['dance.needconsent'],
  needphotos: m['dance.needphotos'],
  loaderror: m['dance.loaderror'],
  retry: m['dance.retry'],
  expired: m['dance.expired'],
  expiredinfo: m['dance.expiredinfo'],
  working: m['dance.working'],
  nocharge: m['dance.nocharge'],
  paymentsclosed: m['dance.paymentsclosed'],
  deletetitle: m['dance.deletetitle'],
  deletebody: m['dance.deletebody'],
  cancel: m['dance.cancel'],
  deleting: m['dance.deleting'],
  confirmdelete: m['dance.confirmdelete'],
  videoerror: m['dance.videoerror'],
  openvideo: m['dance.openvideo'],
  sandbox: m['dance.sandbox'],
  eyebrow: m['dance.eyebrow'],
  lead: m['dance.lead'],
  cast: m['dance.cast'],
  private: m['dance.private'],
  storyboard: m['dance.storyboard'],
  examplepending: m['dance.examplepending'],
  how: m['dance.how'],
  pricing: m['dance.pricing'],
  guide: m['dance.guide'],
  account: m['dance.account'],
  signin: m['dance.signin'],
  studio: m['dance.studio'],
  casttitle: m['dance.casttitle'],
  experimental: m['dance.experimental'],
  mapping: m['dance.mapping'],
  left: m['dance.left'],
  right: m['dance.right'],
  car: m['dance.car'],
  upload: m['dance.upload'],
  photohint: m['dance.photohint'],
  limits: m['dance.limits'],
  consent: m['dance.consent'],
  checking: m['dance.checking'],
  review: m['dance.review'],
  nopay: m['dance.nopay'],
  invalid: m['dance.invalid'],
  orders: m['dance.orders'],
  restore: m['dance.restore'],
  empty: m['dance.empty'],
  mockresult: m['dance.mockresult'],
  mockpay: m['dance.mockpay'],
  download: m['dance.download'],
  support: m['dance.support'],
  requested: m['dance.requested'],
  delete: m['dance.delete'],
  reconcileinfo: m['dance.reconcileinfo'],
  failureinfo: m['dance.failureinfo'],
  howtitle: m['dance.howtitle'],
  step1: m['dance.step1'],
  step1body: m['dance.step1body'],
  step2: m['dance.step2'],
  step2body: m['dance.step2body'],
  step3: m['dance.step3'],
  step3body: m['dance.step3body'],
  pricetitle: m['dance.pricetitle'],
  pricebody: m['dance.pricebody'],
  single: m['dance.single'],
  pendingprice: m['dance.pendingprice'],
  pricepending: m['dance.pricepending'],
  nosub: m['dance.nosub'],
  faq: m['dance.faq'],
  q1: m['dance.q1'],
  a1: m['dance.a1'],
  q2: m['dance.q2'],
  a2: m['dance.a2'],
  q3: m['dance.q3'],
  a3: m['dance.a3'],
  q4: m['dance.q4'],
  a4: m['dance.a4'],
  q5: m['dance.q5'],
  a5: m['dance.a5'],
  q7: m['dance.q7'],
  a7: m['dance.a7'],
  aicontent: m['dance.aicontent'],
  privacy: m['dance.privacy'],
  terms: m['dance.terms'],
  refunds: m['dance.refunds'],
  contact: m['dance.contact'],
  faqtitle: m['dance.faqtitle'],
  order: m['dance.order'],
  status: m['dance.status'],
  provider: m['dance.provider'],
  cost: m['dance.cost'],
  error: m['dance.error'],
  'status.unpaid': m['dance.status.unpaid'],
  'status.queued': m['dance.status.queued'],
  'status.generating': m['dance.status.generating'],
  'status.reconciling': m['dance.status.reconciling'],
  'status.succeeded': m['dance.status.succeeded'],
  'status.failed': m['dance.status.failed'],
  'status.deleted': m['dance.status.deleted'],
};
const t = (key: string) => labels[key]?.() ?? key;
const roles = ['left', 'right'];
export function DanceStudio() {
  const previewOnly = envConfigs.preview_only === 'true';
  const router = useRouter();
  const authSession = useSession();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  // A cached auth session must not change the first client render from SSR.
  const session = {
    ...authSession,
    data: hydrated ? authSession.data : null,
    isPending: !hydrated || authSession.isPending,
  };
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ['dance-settings'],
    queryFn: () => apiGet<{ simulation: boolean }>('/api/dance/settings'),
  });
  const [photos, setPhotos] = useState<(string | null)[]>([null, null]);
  const previews = castPreview(photos);
  const [resolution, setResolution] = useState<DanceResolution>('720P');
  useEffect(() => {
    const saved = loadDanceResolution();
    if (saved) setResolution(saved);
  }, []);
  const [consent, setConsent] = useState(false);
  const [photoErrors, setPhotoErrors] = useState(['', '']);
  const [photoWarnings, setPhotoWarnings] = useState(['', '']);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const readLock = useRef(false);
  const [error, setError] = useState('');
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [readingRole, setReadingRole] = useState<number | null>(null);
  const photoInputs = useRef<(HTMLInputElement | null)[]>([]);
  const pickerSource = useRef<'studio' | 'hero'>('studio');
  useEffect(() => {
    const cleanups = photoInputs.current.map((input, index) => {
      const canceled = () =>
        trackDance('dance_photo_picker_canceled', {
          role: roles[index],
          stage: 'studio',
        });
      input?.addEventListener('cancel', canceled);
      return () => input?.removeEventListener('cancel', canceled);
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [hydrated]);
  async function saveCurrentDraft() {
    if (!photos.some(Boolean)) return;
    const key = requestKey || browserUuid();
    await saveDanceDraft({
      photos,
      consent,
      resolution,
      requestKey: key,
      ownerId: session.data?.user.id,
    });
    setRequestKey(key);
  }
  const [showOrders, setShowOrders] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const submitLock = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const restored = useRef(false);
  const lastUser = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (session.isPending) return;
    const owner = session.data?.user.id;
    if (lastUser.current && lastUser.current !== owner) {
      resetDanceFlow();
      // Hide photos on session loss, but retain the owner-bound draft for
      // re-authentication. A different signed-in account must discard it.
      if (owner) void clearDanceDraft();
      setPhotos([null, null]);
      setConsent(false);
      setRequestKey(null);
    }
    lastUser.current = owner;
    if (restored.current) return;
    restored.current = true;
    void loadDanceDraft(owner)
      .then((draft) => {
        if (!draft) {
          if (
            owner &&
            new URLSearchParams(window.location.search).get('resume') === '1'
          ) {
            trackDance('dance_draft_missing', { stage: 'draft_restore' });
            setError(m['dance.restoremissing']());
            const url = new URL(window.location.href);
            url.searchParams.delete('resume');
            window.history.replaceState(
              null,
              '',
              url.pathname + url.search + url.hash
            );
          }
          return;
        }
        trackDance('dance_draft_restored', {
          resolution: draft.resolution || '720P',
        });
        setPhotos(draft.photos);
        setResolution(draft.resolution || '720P');
        setConsent(draft.consent);
        setRequestKey(draft.requestKey);
        if (
          owner &&
          new URLSearchParams(window.location.search).get('checkout') ===
            'canceled'
        ) {
          // Return to the saved cast and offer, without submitting or charging.
          setPurchaseOpen(true);
          window.history.replaceState(null, '', localizeHref('/#studio'));
        }
        if (
          owner &&
          new URLSearchParams(window.location.search).get('resume') === '1'
        ) {
          window.history.replaceState(null, '', localizeHref('/#studio'));
          void generate(draft);
        }
      })
      .catch(() => {
        trackDance('dance_client_error', {
          stage: 'draft_restore',
          reason: 'storage_failed',
        });
        setError(m['dance.drafterror']());
      });
  }, [session.isPending, session.data?.user.id]);
  useEffect(() => {
    trackDance('dance_studio_viewed');
  }, []);
  useEffect(() => {
    if (!session.isPending && session.data?.user)
      trackDance('dance_session_ready');
  }, [session.isPending, session.data?.user.id]);
  useEffect(() => {
    if (purchaseOpen) trackDance('dance_purchase_shown', { resolution });
  }, [purchaseOpen]);
  const credits = useQuery({
    queryKey: ['dance-credits', session.data?.user.id],
    queryFn: () => apiGet<{ balance: number }>('/api/dance/credits'),
    enabled: !!session.data?.user,
  });
  const quoteBalance =
    session.isPending || (session.data?.user && !credits.isSuccess)
      ? null
      : session.data?.user
        ? credits.data!.balance
        : 0;
  const quote = danceUpfrontQuote(danceCreditCost(resolution), quoteBalance);
  const quotePrice = (cents: number) => `$${(cents / 100).toFixed(2)} USD`;
  const quoteText = (value: DanceResolution) => {
    const item = danceUpfrontQuote(danceCreditCost(value), quoteBalance);
    if (!item) return m['dance.quote.check']();
    return item.canContinue
      ? m['dance.quote.covered']()
      : m['dance.quote.total']({ price: quotePrice(item.cents) });
  };
  const hasPhoto = photos.some(Boolean);
  useEffect(() => {
    if (!hasPhoto || !quote) return;
    trackDance('dance_quote_viewed', {
      resolution,
      pack_id: quote.plan?.id,
      value: quote.cents / 100,
      currency: 'USD',
      quote_cents: quote.cents,
      stage: 'studio',
    });
  }, [hasPhoto, resolution, quote?.cents, quote?.plan?.id]);
  const jobs = useQuery({
    queryKey: ['dance-jobs', session.data?.user.id],
    queryFn: () => apiGet<Job[]>('/api/dance/'),
    enabled: !!session.data?.user,
    retry: false,
    refetchInterval: (query) => {
      if (query.state.status === 'error') return false;
      const active = query.state.data?.filter((job) =>
        ['queued', 'generating', 'reconciling'].includes(job.status)
      );
      if (!active?.length) return false;
      const delayed = active.some(
        (job) => Date.now() / 1000 - job.createdAt >= 900
      );
      return delayed ? 30_000 : 10_000;
    },
    staleTime: 10000,
  });
  const [progressNow, setProgressNow] = useState(0);
  const activeJobs = jobs.data?.some((job) => !!danceProgress(job));
  useEffect(() => {
    if (!activeJobs) return;
    setProgressNow(Date.now());
    const timer = window.setInterval(() => setProgressNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [activeJobs]);
  useEffect(() => {
    if (jobs.data?.some((job) => job.status === 'failed'))
      void qc.invalidateQueries({ queryKey: ['dance-credits'] });
  }, [jobs.data, qc]);
  useEffect(() => {
    if (window.location.hash === '#orders') setShowOrders(true);
  }, []);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['dance-credits'] });
    return qc.invalidateQueries({ queryKey: ['dance-jobs'] });
  };
  const resultObserver = useRef(createDanceResultObserver());
  useEffect(() => {
    resultObserver.current = createDanceResultObserver();
  }, [session.data?.user.id]);
  useEffect(() => {
    jobs.data?.forEach((job) => resultObserver.current(job));
  }, [jobs.data]);
  const create = useMutation({
    mutationFn: (draft: {
      photos: (string | null)[];
      consent: boolean;
      requestKey: string;
      resolution?: DanceResolution;
    }) =>
      apiPost<Job>('/api/dance/', {
        ...draft,
        useCredits: true,
        flowId: danceFlowId(),
      }),
    onMutate: (draft) =>
      trackDance('dance_upload_started', { resolution: draft.resolution }),
    onSuccess: (job) => {
      const params = {
        resolution: job.resolution,
        simulation: job.simulation,
        payment_mode: job.paymentMode,
      };
      trackDanceOnce(`${job.id}:upload`, 'dance_upload_succeeded', params);
      trackDanceOnce(`${job.id}:queued`, 'dance_generation_queued', params);
      resultObserver.current(job, true);
      void clearDanceDraft().catch(() => {});
      setRequestKey(null);
      setPhotos([null, null]);
      setConsent(false);
      setShowOrders(true);
      window.history.replaceState(null, '', localizeHref('/#orders'));
      requestAnimationFrame(() =>
        document.getElementById('orders')?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
            .matches
            ? 'auto'
            : 'smooth',
          block: 'start',
        })
      );
      setError('');
      refresh();
    },
    onError: (e: Error, draft) => {
      trackDance('dance_upload_failed', {
        resolution: draft.resolution,
        reason: danceErrorReason(e),
      });
      if (e.message === 'INSUFFICIENT_CREDITS') setPurchaseOpen(true);
      else setError(t('createerror'));
    },
  });
  const action = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      apiPost('/api/dance/action', { id, action }),
    onMutate: () => setOrderError(null),
    onSuccess: () => {
      setDeleteTarget(null);
      refresh();
    },
    onError: (_e: Error, variables) =>
      setOrderError({ id: variables.id, message: t('actionerror') }),
  });
  async function generate(restoredDraft?: {
    photos: (string | null)[];
    consent: boolean;
    requestKey: string;
    resolution?: DanceResolution;
  }) {
    if (
      previewOnly ||
      readLock.current ||
      submitLock.current ||
      create.isPending ||
      preparing
    )
      return;
    const draft = restoredDraft || {
      photos,
      resolution,
      consent,
      requestKey: requestKey || '',
    };
    if (
      !draft.consent ||
      draft.photos.length !== 2 ||
      !draft.photos.every(Boolean)
    )
      return;
    trackDance('dance_generate_clicked', {
      resolution: draft.resolution,
      photo_count: draft.photos.filter(Boolean).length,
      default_roles: draft.photos.filter((p) => p === null).length,
    });
    submitLock.current = true;
    setPreparing(true);
    setError('');
    let saved = false;
    let submitted = false;
    try {
      draft.requestKey ||= browserUuid();
      setRequestKey(draft.requestKey);
      await saveDanceDraft({ ...draft, ownerId: session.data?.user.id });
      saved = true;
      if (!session.data?.user) {
        trackDance('dance_login_required', { stage: 'generation' });
        setLoginOpen(true);
        return;
      }
      const account = await qc.fetchQuery({
        queryKey: ['dance-credits', session.data.user.id],
        queryFn: () => apiGet<{ balance: number }>('/api/dance/credits'),
        staleTime: 0,
      });
      if (account.balance < danceCreditCost(draft.resolution)) {
        trackDance('dance_credits_required', { resolution: draft.resolution });
        setPurchaseOpen(true);
        return;
      }
      submitted = true;
      await create.mutateAsync(draft);
    } catch (error) {
      if (saved && !submitted)
        trackDance('dance_client_error', {
          stage: 'credits_check',
          reason: danceErrorReason(error),
        });
      if (!saved)
        trackDance('dance_client_error', {
          stage: 'draft_save',
          reason: 'storage_failed',
        });
      if (error instanceof Error && error.message === 'Sign in to continue')
        setLoginOpen(true);
      else setError(saved ? t('createerror') : m['dance.drafterror']());
    } finally {
      submitLock.current = false;
      setPreparing(false);
    }
  }
  async function select(file: File | undefined, index: number) {
    if (!file || readLock.current) return;
    trackDance('dance_photo_selected', { role: roles[index] });
    const photoError = (message: string) =>
      setPhotoErrors((current) =>
        current.map((v, i) => (i === index ? message : v))
      );
    photoError('');
    setPhotoWarnings((current) =>
      current.map((v, i) => (i === index ? '' : v))
    );
    const mime = file.type.toLowerCase() || 'empty';
    const parsed = funnelParamsSchema.safeParse({ source_mime: mime });
    const diagnostic: FunnelParams = {
      source_mime: parsed.success ? parsed.data.source_mime : 'other',
      source_bytes: file.size,
      photo_rule: DANCE_PHOTO_RULE_VERSION,
    };
    readLock.current = true;
    setReading(true);
    setReadingRole(index);
    try {
      const value = await prepareDancePhoto(
        file,
        (width, height) => {
          diagnostic.source_width = width;
          diagnostic.source_height = height;
        },
        (decoder) => {
          diagnostic.photo_decoder = decoder;
        }
      );
      setPhotos((current) =>
        current.map((photo, i) => (i === index ? value : photo))
      );
      setRequestKey(null);
      setError('');
      trackDance('dance_photo_ready', {
        role: roles[index],
        ...diagnostic,
        photo_stage: 'ready',
      });
      if (
        Math.min(diagnostic.source_width || 0, diagnostic.source_height || 0) <
        320
      )
        setPhotoWarnings((current) =>
          current.map((v, i) =>
            i === index ? m['dance.photo.low_resolution']() : v
          )
        );
    } catch (error) {
      const reason =
        error instanceof DancePhotoError ? error.reason : 'image_decode_failed';
      trackDance('dance_photo_failed', {
        role: roles[index],
        reason,
        ...diagnostic,
        photo_stage: error instanceof DancePhotoError ? error.stage : 'decode',
      });
      const messages = {
        file_too_large: m['dance.photo.file_too_large'],
        unsupported_format: m['dance.photo.unsupported_format'],
        image_too_small: m['dance.photo.image_too_small'],
        image_dimensions_exceeded: m['dance.photo.image_dimensions_exceeded'],
        image_resize_unavailable: m['dance.photo.image_resize_unavailable'],
        image_aspect_ratio: m['dance.photo.image_aspect_ratio'],
        image_decode_failed: m['dance.photo.image_decode_failed'],
        image_processing_failed: m['dance.photo.image_processing_failed'],
        heic_not_supported: m['dance.photo.heic_not_supported'],
        image_decode_timeout: m['dance.photo.image_decode_timeout'],
      };
      photoError(messages[reason]());
    } finally {
      readLock.current = false;
      setReading(false);
      setReadingRole(null);
    }
  }
  return (
    <div className="dance-page">
      <header className="dance-header">
        <Link href="/" className="dance-brand">
          <Video size={25} />
          <span>{envConfigs.app_name}</span>
        </Link>
        <nav>
          <a href="#how">{t('how')}</a>
          <Link href="/pricing">{t('pricing')}</Link>
          <a href="#faq">{t('faqtitle')}</a>
        </nav>
        <div className="dance-account-group">
          <LocaleSelector variant="pill" className="dance-language-selector" />
          {!previewOnly && (
            <Link
              onClick={(event) => {
                if (!session.data?.user) return;
                event.preventDefault();
                setShowOrders(true);
                window.history.replaceState(null, '', '#orders');
                requestAnimationFrame(() =>
                  document
                    .getElementById('orders')
                    ?.scrollIntoView({ block: 'start' })
                );
              }}
              className="dance-account"
              href={
                session.data ? '/#orders' : '/sign-in?callbackUrl=%2F%23studio'
              }
            >
              <span className="dance-account-label">
                {session.isPending
                  ? t('loading')
                  : session.data
                    ? t('account')
                    : t('signin')}
              </span>
              <span className="dance-account-label-short">
                {session.isPending
                  ? t('loading')
                  : session.data
                    ? t('account')
                    : m['common.sign.sign_in_title']()}
              </span>
              <ArrowUpRight size={16} />
            </Link>
          )}
          {session.data?.user && (
            <Suspense fallback={<span className="inline-block size-9" />}>
              <SiteUserMenu
                name={session.data.user.name}
                email={session.data.user.email}
                image={session.data.user.image ?? undefined}
              />
            </Suspense>
          )}
        </div>
      </header>
      <main>
        {previewOnly && (
          <p className="dance-preview-banner" role="status">
            {m['dance.preview_only']()}
          </p>
        )}
        <div className="dance-generator dance-cast-first">
          <section className="dance-hero">
            <div className="dance-intro">
              <p className="dance-eyebrow">{t('eyebrow')}</p>
              <h1>{m['dance.headline']()}</h1>
              <p className="dance-lead">{t('lead')}</p>
            </div>
          </section>
          <section className="dance-workbench">
            <div
              id="examples"
              className="dance-story"
              aria-label={t('storyboard')}
            >
              <div className="dance-example-stage">
                <div className="dance-video-frame">
                  <span className="dance-video-label">
                    <Play size={12} />
                    {t('examplepending')}
                  </span>
                  <DanceVideo
                    autoPreview
                    previewLabels={{
                      play: m['dance.preview.play'](),
                      pause: m['dance.preview.pause'](),
                      mute: m['dance.preview.mute'](),
                      unmute: m['dance.preview.unmute'](),
                    }}
                    onPlaybackError={(reason) =>
                      trackDance('dance_video_failed', {
                        stage: 'example',
                        reason,
                      })
                    }
                    className="dance-reference-video"
                    preload="none"
                    poster={danceTrendPreview.poster}
                    src={danceTrendPreview.src}
                    width={danceTrendPreview.width}
                    height={danceTrendPreview.height}
                    label={t('storyboard')}
                    errorLabel={t('videoerror')}
                    retryLabel={t('retry')}
                    openLabel={t('openvideo')}
                  />
                </div>
              </div>
              <div className="dance-story-caption">
                <span>
                  <Play size={14} />
                  {t('examplepending')}
                </span>
                <span>{m['dance.reference_trial_note']()}</span>
              </div>
            </div>
            <div id="studio" className="dance-input-panel">
              <div className="dance-section-title">
                <h2>{m['dance.cast.choose']()}</h2>
              </div>
              <p className="dance-muted">{m['dance.cast.one']()}</p>
              <div className="dance-upload-grid">
                {roles.map((role, index) => (
                  <div className="dance-upload-slot" key={role}>
                    <p className="dance-role-description">
                      {index === 0
                        ? m['dance.cast.role_a']()
                        : m['dance.cast.role_b']()}
                    </p>
                    <label
                      className={`dance-upload ${previews[index] ? 'has-photo' : 'dance-upload-start'} ${!photos[index] && previews[index] ? 'dance-default-photo' : ''}`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (create.isPending || preparing || readLock.current)
                          return;
                        if (event.dataTransfer.files.length !== 1) {
                          setPhotoErrors((current) =>
                            current.map((v, i) =>
                              i === index ? t('onefile') : v
                            )
                          );
                          return;
                        }
                        void select(event.dataTransfer.files[0], index);
                      }}
                    >
                      <span className="dance-role">
                        <b>0{index + 1}</b>
                        {t(role)}
                        {photos[index] && (
                          <span aria-label={m['dance.cast.selected']()}>
                            {' '}
                            ✓
                          </span>
                        )}
                      </span>
                      {previews[index] ? (
                        <span className="dance-photo-frame">
                          <img
                            data-clarity-mask="true"
                            src={previews[index]!}
                            alt={t(role)}
                          />
                        </span>
                      ) : (
                        <span className="dance-upload-icon">
                          <Plus size={30} />
                          <span>{t('upload')}</span>
                        </span>
                      )}
                      <input
                        ref={(element) => {
                          photoInputs.current[index] = element;
                        }}
                        type="file"
                        accept={DANCE_PHOTO_ACCEPT}
                        aria-label={t(role)}
                        aria-invalid={!!photoErrors[index]}
                        aria-describedby={`photo-help-${index}${photoErrors[index] ? ` photo-error-${index}` : ''}`}
                        disabled={
                          !hydrated || reading || create.isPending || preparing
                        }
                        onClick={() => {
                          trackDance('dance_photo_picker_opened', {
                            role,
                            stage: pickerSource.current,
                          });
                          pickerSource.current = 'studio';
                        }}
                        onChange={(event) => {
                          const input = event.currentTarget;
                          const file = input.files?.[0];
                          // Keep mobile picker-backed files alive until decoding finishes.
                          void select(file, index).finally(() => {
                            input.value = '';
                          });
                        }}
                      />
                      <span
                        className="dance-upload-hint"
                        id={`photo-help-${index}`}
                      >
                        {readingRole === index
                          ? m['dance.photo.preparing']()
                          : previews[index]
                            ? m['dance.cast.replace']()
                            : m['dance.startanyrole']()}
                      </span>
                    </label>
                    {photos[index] && (
                      <button
                        type="button"
                        className="dance-remove-photo"
                        disabled={reading || create.isPending || preparing}
                        aria-label={t('remove') + ' ' + t(role)}
                        onClick={() => {
                          setPhotos((current) =>
                            current.map((v, i) => (i === index ? null : v))
                          );
                          setRequestKey(null);
                          setPhotoErrors((current) =>
                            current.map((v, i) => (i === index ? '' : v))
                          );
                        }}
                      >
                        {t('remove')}
                      </button>
                    )}
                    {photoErrors[index] && (
                      <div
                        id={`photo-error-${index}`}
                        className="dance-photo-recovery"
                        role="alert"
                      >
                        <p className="dance-photo-error">
                          {photoErrors[index]}
                        </p>
                        {photos[index] && (
                          <p>{m['dance.photo.previous_kept']()}</p>
                        )}
                        <button
                          type="button"
                          disabled={reading || create.isPending || preparing}
                          onClick={() => photoInputs.current[index]?.click()}
                        >
                          {m['dance.photo.choose_another']()}
                        </button>
                      </div>
                    )}
                    {photos[index] && photoWarnings[index] && (
                      <p className="dance-photo-hint">{photoWarnings[index]}</p>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="dance-swap-roles"
                disabled={
                  !photos.some(Boolean) ||
                  reading ||
                  preparing ||
                  create.isPending
                }
                onClick={() => {
                  setPhotos(([a, b]) => [b, a]);
                  setPhotoErrors(([a, b]) => [b, a]);
                  setPhotoWarnings(([a, b]) => [b, a]);
                  setRequestKey(null);
                }}
              >
                {m['dance.cast.swap']()}
              </button>
              <p className="dance-cast-note">{m['dance.cast.defaults']()}</p>
              <p className="dance-cast-price">
                {m['dance.output.spec']()} · {quoteText(resolution)}
              </p>
              <p className="dance-muted dance-cast-privacy">
                <LockKeyhole size={14} />
                {t('private')}
              </p>
              {photos.some(Boolean) && (
                <div className="dance-cast-options">
                  <p className="dance-fileinfo">
                    <Upload size={14} />
                    {t('limits')}
                  </p>
                  <fieldset
                    className="dance-resolution"
                    disabled={preparing || create.isPending}
                  >
                    <legend>{m['dance.resolution']()}</legend>
                    <div>
                      {danceResolutions.map((value) => (
                        <label key={value}>
                          <input
                            type="radio"
                            name="resolution"
                            value={value}
                            checked={resolution === value}
                            onChange={() => {
                              trackDance('dance_resolution_changed', {
                                resolution: value,
                                stage: 'studio',
                              });
                              setResolution(value);
                              setRequestKey(null);
                              saveDanceResolution(value);
                            }}
                          />
                          <span>
                            <strong>{value.toLowerCase()}</strong>
                            <small>{quoteText(value)}</small>
                            <small>
                              {danceCreditCost(value)} {m['dance.credits']()}
                            </small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="dance-consent">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    {t('consent')}
                  </label>

                  <p className="dance-readiness" aria-live="polite">
                    {reading
                      ? t('reading')
                      : photos.every(Boolean)
                        ? consent
                          ? t('ready')
                          : t('needconsent')
                        : t('needphotos')}
                  </p>
                  <div className="dance-checkout-row">
                    <div>
                      <Button
                        className="dance-primary"
                        disabled={
                          previewOnly ||
                          session.isPending ||
                          !consent ||
                          !photos.every(Boolean) ||
                          create.isPending ||
                          reading ||
                          preparing
                        }
                        onClick={() => void generate()}
                      >
                        {previewOnly
                          ? m['dance.coming_soon']()
                          : create.isPending || preparing
                            ? t('checking')
                            : quote?.canContinue
                              ? m['dance.generate']({
                                  credits: danceCreditCost(resolution),
                                })
                              : m['dance.quote.review']()}{' '}
                        <ArrowUpRight size={18} />
                      </Button>
                      <small>{t('nopay')}</small>
                      <small aria-live="polite">
                        {!quote
                          ? m['dance.quote.check']()
                          : quote.canContinue
                            ? m['dance.quote.use']({
                                credits: danceCreditCost(resolution),
                                remaining: quote.remaining,
                              })
                            : m['dance.quote.pack']({
                                price: quotePrice(quote.cents),
                                pack: quote.plan!.credits,
                                credits: danceCreditCost(resolution),
                                remaining: quote.remaining,
                              })}
                      </small>
                      {credits.data && (
                        <small>
                          {m['dance.balance']()}: {credits.data.balance}{' '}
                          {m['dance.credits']()}
                        </small>
                      )}
                      {settings.data?.simulation && (
                        <small>{t('sandbox')}</small>
                      )}
                    </div>
                  </div>
                  {error && (
                    <p className="dance-error" role="alert">
                      <AlertCircle size={16} />
                      {error}
                    </p>
                  )}
                </div>
              )}
              <a className="dance-preview-link" href="#examples">
                <Play size={16} />
                {m['dance.examples.jump']()}
                <span aria-hidden="true">↓</span>
              </a>
            </div>
          </section>
        </div>
        {session.data?.user && (
          <details
            id="orders"
            className="dance-orders"
            open={showOrders}
            onToggle={(event) => setShowOrders(event.currentTarget.open)}
          >
            <summary>
              {t('orders')} <span>{jobs.data?.length ?? 0}</span>
            </summary>
            <div className="dance-section-title">
              <span className="dance-muted">{t('restore')}</span>
              <button
                type="button"
                disabled={jobs.isFetching}
                onClick={() => void jobs.refetch()}
              >
                {m['dance.progress.refresh']()}
              </button>
            </div>
            {jobs.isError && (
              <div role="alert" className="dance-error">
                {t('loaderror')}{' '}
                <button onClick={() => jobs.refetch()}>{t('retry')}</button>
              </div>
            )}
            {jobs.isPending && <p role="status">{t('loading')}</p>}
            {jobs.data?.length === 0 && <p>{t('empty')}</p>}
            <div className="dance-results-grid" data-clarity-mask="true">
              {showOrders &&
                jobs.data?.map((job) => (
                  <article className="dance-order" key={job.id}>
                    <div className="dance-result-meta">
                      <span className="dance-chip">
                        {job.expired || job.status === 'deleted'
                          ? t('expired')
                          : !job.simulation && job.status === 'succeeded'
                            ? m['dance.resultready']()
                            : t(`status.${job.status}`)}
                      </span>
                      <p className="dance-order-date">
                        {new Date(job.createdAt * 1000).toLocaleString(
                          'en-US',
                          {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          }
                        )}
                      </p>
                      {!job.expired &&
                        job.status !== 'deleted' &&
                        job.status === 'succeeded' && (
                          <p className="dance-result-caption">
                            {job.simulation
                              ? t('mockresult')
                              : job.resolution?.toLowerCase() || '480p'}
                          </p>
                        )}
                      {(job.expired || job.status === 'deleted') && (
                        <p>{t('expiredinfo')}</p>
                      )}
                      {['queued', 'generating', 'reconciling'].includes(
                        job.status
                      ) &&
                        !job.expired && (
                          <p role="status" className="dance-order-progress">
                            <span className="dance-spinner" />
                            {job.status === 'queued'
                              ? m['dance.progress.queued']()
                              : job.status === 'reconciling'
                                ? m['dance.progress.reconciling']()
                                : m['dance.progress.generating']()}
                            <span>
                              {m['dance.progress.elapsed']({
                                minutes:
                                  danceProgress(job, progressNow || Date.now())
                                    ?.minutes ?? 0,
                              })}
                            </span>
                          </p>
                        )}
                      {job.status === 'unpaid' && !job.expired && (
                        <div className="dance-order-cast">
                          {roles.map((role, i) => (
                            <figure key={role}>
                              <img
                                src={`/api/dance/file?id=${job.id}&slot=${i}`}
                                width="60"
                                height="76"
                                alt={t(role)}
                              />
                              <figcaption>{t(role)}</figcaption>
                            </figure>
                          ))}
                        </div>
                      )}
                      {job.errorCode && (
                        <p className="dance-error">
                          {!job.simulation && job.status === 'failed'
                            ? m['dance.realfailureinfo']()
                            : t(
                                job.status === 'reconciling'
                                  ? 'reconcileinfo'
                                  : 'failureinfo'
                              )}
                        </p>
                      )}
                      {['queued', 'generating', 'reconciling'].includes(
                        job.status
                      ) &&
                        !job.expired &&
                        danceProgress(job, progressNow || Date.now())
                          ?.delayed && (
                          <p className="dance-muted" role="status">
                            {m['dance.delivery.wait']()}{' '}
                            {m['dance.progress.safe']()}{' '}
                            <Link href="/contact">{t('support')}</Link>
                          </p>
                        )}
                    </div>
                    {job.status === 'succeeded' && !job.expired && (
                      <div className="dance-result-media">
                        <DanceVideo
                          src={`/api/dance/file?id=${job.id}&slot=video`}
                          label={
                            job.simulation
                              ? t('mockresult')
                              : m['dance.realresult']()
                          }
                          diagnose={() =>
                            qc.fetchQuery({
                              queryKey: ['dance-video-status', job.id],
                              queryFn: () => readDanceVideoState(job.id),
                              staleTime: 0,
                              retry: false,
                            })
                          }
                          errorLabels={{
                            authentication_required:
                              m['dance.video.auth_required'](),
                            video_network: m['dance.video.network'](),
                            video_decode: m['dance.video.decode'](),
                            video_unsupported: m['dance.video.decode'](),
                            video_missing: m['dance.video.missing'](),
                            video_expired: m['dance.video.expired'](),
                            video_not_ready: m['dance.video.not_ready'](),
                            video_unavailable: m['dance.video.unavailable'](),
                          }}
                          signIn={{
                            href: localizeHref(
                              '/sign-in?callbackUrl=%2F%23orders'
                            ),
                            label: m['common.sign.sign_in_title'](),
                          }}
                          onRetry={() =>
                            trackDance('dance_video_retry', {
                              stage: 'result',
                              resolution: job.resolution,
                            })
                          }
                          onRecovered={() =>
                            trackDance('dance_video_recovered', {
                              stage: 'result',
                              resolution: job.resolution,
                            })
                          }
                          onPlaybackError={(reason) =>
                            trackDance('dance_video_failed', {
                              stage: 'result',
                              reason,
                              simulation: job.simulation,
                              resolution: job.resolution,
                            })
                          }
                          errorLabel={t('videoerror')}
                          retryLabel={t('retry')}
                          openLabel={t('openvideo')}
                        />
                        <a
                          onClick={() =>
                            trackDance('dance_download_clicked', {
                              simulation: job.simulation,
                              resolution: job.resolution,
                              payment_mode: job.paymentMode,
                            })
                          }
                          className="dance-download"
                          href={`/api/dance/file?id=${job.id}&slot=video&download=1`}
                        >
                          {job.simulation
                            ? t('download')
                            : m['dance.downloadreal']()}
                        </a>
                        <a
                          className="dance-another-link"
                          href="#studio"
                          onClick={() =>
                            trackDance('dance_make_another_clicked', {
                              resolution: job.resolution,
                            })
                          }
                        >
                          {m['dance.result.another']()}
                        </a>
                      </div>
                    )}
                    {orderError?.id === job.id && (
                      <p className="dance-error" role="alert">
                        {orderError.message}
                      </p>
                    )}
                    <div className="dance-order-actions">
                      <button
                        disabled={action.isPending || !!job.supportRequested}
                        onClick={() =>
                          action.mutate({ id: job.id, action: 'support' })
                        }
                      >
                        {t(job.supportRequested ? 'requested' : 'support')}
                      </button>
                      {job.status !== 'deleted' && (
                        <button
                          disabled={action.isPending}
                          onClick={() => {
                            setOrderError(null);
                            setDeleteTarget(job.id);
                          }}
                        >
                          {t('delete')}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
            </div>
          </details>
        )}

        <DanceTrend />
        <DancePricing
          resolution={resolution}
          beforeCheckout={saveCurrentDraft}
        />
        <section id="how" className="dance-how">
          <p className="dance-eyebrow">{t('how')}</p>
          <h2>{t('howtitle')}</h2>
          <div>
            {['step1', 'step2', 'step3'].map((key, i) => (
              <article key={key}>
                <span>0{i + 1}</span>
                <h3>{t(key)}</h3>
                <p>{t(`${key}body`)}</p>
              </article>
            ))}
          </div>
          <a href="#studio">{t('cast')} ↗</a>
        </section>
        <section id="faq" className="dance-faq">
          <h2>{t('faq')}</h2>
          {danceFaq.map(([question, answer], i) => (
            <details key={i}>
              <summary>{question()}</summary>
              <p>{answer()}</p>
            </details>
          ))}
        </section>
        <DanceClosingCta />
      </main>
      <Suspense fallback={null}>
        {loginOpen && (
          <DanceDialog
            open={loginOpen}
            onOpenChange={setLoginOpen}
            className="dance-auth-dialog"
            title={m['dance.logintitle']()}
            description={m['dance.loginbody']()}
          >
            <Suspense fallback={<p>{t('loading')}</p>}>
              <SignInForm embedded returnTo="/?resume=1#studio" />
            </Suspense>
          </DanceDialog>
        )}
        {purchaseOpen && (
          <DanceDialog
            open={purchaseOpen}
            onOpenChange={(open) => {
              if (!open)
                trackDance('dance_purchase_closed', {
                  resolution,
                  reason: 'dismissed',
                  stage: 'purchase',
                });
              setPurchaseOpen(open);
            }}
            className="dance-purchase-dialog"
            title={m['dance.continuepurchase']()}
            description={m['dance.savedcast']()}
          >
            <div className="dance-purchase-cast" data-clarity-mask="true">
              {previews.map(
                (photo, i) =>
                  photo && (
                    <figure key={i}>
                      <img src={photo} alt={t(roles[i])} />
                      <figcaption>
                        {t(roles[i])}
                        {!photos[i] && <> · {m['dance.defaultcharacter']()}</>}
                      </figcaption>
                    </figure>
                  )
              )}
              <span>
                {resolution.toLowerCase()} · {danceCreditCost(resolution)}{' '}
                {m['dance.credits']()}
              </span>
            </div>
            <DancePricing
              beforeCheckout={saveCurrentDraft}
              forGeneration
              requiredCredits={danceCreditCost(resolution)}
              resolution={resolution}
              onContinue={() => {
                setPurchaseOpen(false);
                void generate();
              }}
            />
            <Button
              variant="ghost"
              className="dance-purchase-back"
              onClick={() => {
                trackDance('dance_purchase_closed', {
                  resolution,
                  reason: 'back_to_studio',
                  stage: 'purchase',
                });
                setPurchaseOpen(false);
              }}
            >
              {m['dance.purchase.back']()}
            </Button>
          </DanceDialog>
        )}
        {!!deleteTarget && (
          <DanceDialog
            open={!!deleteTarget}
            onOpenChange={(open) => {
              if (!open && !action.isPending) setDeleteTarget(null);
            }}
            className="dance-delete-dialog"
            showCloseButton={!action.isPending}
            title={t('deletetitle')}
            description={t('deletebody')}
          >
            {orderError?.id === deleteTarget && (
              <p role="alert">{orderError?.message}</p>
            )}
            <div className="dance-dialog-actions">
              <Button
                variant="outline"
                disabled={action.isPending}
                onClick={() => setDeleteTarget(null)}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="destructive"
                disabled={action.isPending}
                onClick={() =>
                  deleteTarget &&
                  action.mutate({ id: deleteTarget, action: 'delete' })
                }
              >
                {action.isPending ? t('deleting') : t('confirmdelete')}
              </Button>
            </div>
          </DanceDialog>
        )}
      </Suspense>
      <footer className="dance-footer">
        <span>
          {envConfigs.app_name} / {t('aicontent')}
        </span>
        <div>
          <Link href="/privacy-policy">{t('privacy')}</Link>
          <Link href="/terms-of-service">{t('terms')}</Link>
          <Link href="/refund-policy">{t('refunds')}</Link>
          <Link href="/contact">{t('contact')}</Link>
        </div>
      </footer>
    </div>
  );
}

export function DanceAdmin() {
  const query = useQuery({
    queryKey: ['admin-dance'],
    queryFn: () => apiGet<Job[]>('/api/admin/dance'),
    refetchInterval: 5000,
  });
  return (
    <section className="p-6">
      <h1 className="mb-6 text-2xl">{t('orders')}</h1>
      <p>{t('sandbox')}</p>
      {query.isError && <p role="alert">{query.error.message}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {['order', 'status', 'provider', 'cost', 'support', 'error'].map(
                (key) => (
                  <th className="p-3" key={key}>
                    {t(key)}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {query.data?.map((job) => (
              <tr key={job.id}>
                <td className="p-3">{job.id}</td>
                <td>{t(`status.${job.status}`)}</td>
                <td>{job.providerId || '—'}</td>
                <td>
                  {job.providerCostCents === null
                    ? '—'
                    : `$${(job.providerCostCents / 100).toFixed(2)}`}
                </td>
                <td>{job.supportRequested ? t('requested') : '—'}</td>
                <td>{job.errorCode || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
