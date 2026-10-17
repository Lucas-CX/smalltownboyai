import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  LockKeyhole,
  Play,
  Plus,
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
import { runtimeDiagnostic } from '@/lib/dance-diagnostics';
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
import {
  clearDanceLoginIntent,
  consumeDanceLoginIntent,
  saveDanceLoginIntent,
} from '@/lib/dance-login-intent';
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
import { type DanceResolution } from '@/lib/dance-settings';
import { readDanceVideoState } from '@/lib/dance-video-state';
import { m } from '@/paraglide/messages.js';
import { getLocale, localizeHref } from '@/paraglide/runtime.js';
import { DanceGuides } from '@/blocks/dance-guides';
import { DancePricing } from '@/blocks/dance-pricing';
import { DanceSocialExamples } from '@/blocks/dance-social-examples';
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
  expiresAt?: number;
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
  const [paymentReturn, setPaymentReturn] = useState(false);
  useEffect(() => {
    setPaymentReturn(
      new URLSearchParams(window.location.search).get('payment') === 'review'
    );
  }, []);
  const paymentReview = useQuery({
    queryKey: ['dance-payment-review', session.data?.user.id],
    queryFn: async () => {
      const result = await apiGet<{
        status: 'confirmed' | 'pending' | 'login';
      }>('/api/dance/payment-return?check=1');
      if (result.status === 'confirmed')
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['dance-credits'] }),
          qc.invalidateQueries({ queryKey: ['dance-payment-analytics'] }),
        ]);
      return result;
    },
    enabled: paymentReturn && !session.isPending,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const paymentUnconfirmed =
    paymentReturn &&
    (paymentReview.isFetching || paymentReview.data?.status !== 'confirmed');
  const settings = useQuery({
    queryKey: ['dance-settings'],
    queryFn: () => apiGet<{ simulation: boolean }>('/api/dance/settings'),
  });
  const [photos, setPhotos] = useState<(string | null)[]>([null, null]);
  const previews = castPreview(photos);
  const resolution: DanceResolution = '720P';
  const [packId, setPackId] =
    useState<(typeof dancePlans)[number]['id']>('friends');
  const checkoutKeys = useRef<
    Partial<Record<(typeof dancePlans)[number]['id'], string>>
  >({});
  const selectedPlan = dancePlans.find((plan) => plan.id === packId)!;
  const checkout = useMutation({
    mutationFn: (input: {
      packId: (typeof dancePlans)[number]['id'];
      requestKey: string;
    }) =>
      apiPost<{ checkoutUrl?: string }>('/api/dance/credits', {
        ...input,
        confirmPreview: true,
        flowId: danceFlowId(),
        locale: getLocale(),
      }),
  });
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
      packId,
      checkoutKeys: checkoutKeys.current,
      consent,
      resolution,
      requestKey: key,
      ownerId: session.data?.user.id,
    });
    setRequestKey(key);
  }
  const [showHistory, setShowHistory] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginToken, setLoginToken] = useState<string | null>(null);
  const [loginContinuation, setLoginContinuation] = useState<{
    photos: (string | null)[];
    consent: boolean;
    requestKey: string;
    resolution?: DanceResolution;
  } | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  useEffect(() => {
    setCurrentJobId(new URLSearchParams(window.location.search).get('task'));
  }, []);
  const [submissionUnknown, setSubmissionUnknown] = useState(false);
  const submitLock = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const [draftReadyFor, setDraftReadyFor] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<
    'saved' | 'restored' | 'error' | null
  >(null);
  const hadDraftPhotos = useRef(false);
  const lastUser = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (session.isPending) return;
    let canceled = false;
    const owner = session.data?.user.id;
    setDraftReadyFor(null);
    hadDraftPhotos.current = false;
    if (lastUser.current && lastUser.current !== owner) {
      resetDanceFlow();
      // Hide photos on session loss, but retain the owner-bound draft for
      // re-authentication. A different signed-in account must discard it.
      if (owner) void clearDanceDraft();
      setPackId('friends');
      checkoutKeys.current = {};
      setPhotos([null, null]);
      setConsent(false);
      setRequestKey(null);
    }
    lastUser.current = owner;
    void loadDanceDraft(owner)
      .then(async (draft) => {
        if (canceled) return;
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
        setPackId(draft.packId || 'friends');
        checkoutKeys.current = draft.checkoutKeys || {};

        // Restoration never authorizes a generation, even after login/payment.
        setConsent(false);
        setRequestKey(draft.resolution === '720P' ? draft.requestKey : null);
        hadDraftPhotos.current = draft.photos.some(Boolean);
        setDraftNotice('restored');
        const continuationUrl = new URL(window.location.href);
        const token = continuationUrl.searchParams.get('continueGeneration');
        if (owner && token) {
          const allowed = await consumeDanceLoginIntent(
            token,
            {
              photos: draft.photos,
              requestKey: draft.requestKey,
              resolution: draft.resolution,
              packId: draft.packId,
            },
            (
              performance.getEntriesByType('navigation')[0] as
                | PerformanceNavigationTiming
                | undefined
            )?.type || 'unknown'
          );
          continuationUrl.searchParams.delete('continueGeneration');
          window.history.replaceState(
            null,
            '',
            continuationUrl.pathname +
              continuationUrl.search +
              continuationUrl.hash
          );
          if (
            !canceled &&
            allowed &&
            !continuationUrl.searchParams.has('payment') &&
            !continuationUrl.searchParams.has('checkout')
          ) {
            setConsent(true);
            setLoginContinuation({ ...draft, consent: true });
          }
        }
        if (
          owner &&
          new URLSearchParams(window.location.search).get('checkout') ===
            'canceled'
        ) {
          // Return to the saved cast and offer, without submitting or charging.
          const url = new URL(window.location.href);
          url.searchParams.delete('resume');
          url.searchParams.delete('checkout');
          window.history.replaceState(
            null,
            '',
            url.pathname + url.search + '#studio'
          );
        }
        if (
          owner &&
          new URLSearchParams(window.location.search).get('resume') === '1'
        ) {
          const url = new URL(window.location.href);
          url.searchParams.delete('resume');
          url.searchParams.delete('checkout');
          window.history.replaceState(
            null,
            '',
            url.pathname + url.search + '#studio'
          );
        }
      })
      .catch(() => {
        if (canceled) return;
        trackDance('dance_client_error', {
          stage: 'draft_restore',
          reason: 'storage_failed',
        });
        setError(m['dance.drafterror']());
      })
      .finally(() => {
        if (!canceled) setDraftReadyFor(owner || 'anonymous');
      });
    return () => {
      canceled = true;
    };
  }, [session.isPending, session.data?.user.id]);
  useEffect(() => {
    const owner = session.data?.user.id;
    if (session.isPending || draftReadyFor !== (owner || 'anonymous')) return;
    if (!photos.some(Boolean)) {
      if (hadDraftPhotos.current) void clearDanceDraft();
      hadDraftPhotos.current = false;
      setDraftNotice(null);
      return;
    }
    hadDraftPhotos.current = true;
    let canceled = false;
    // Only local storage writes on edits; no timer, polling or server request.
    void saveDanceDraft({
      photos,
      packId,
      checkoutKeys: checkoutKeys.current,
      resolution,
      consent: false,
      requestKey: requestKey || '',
      ownerId: owner,
    })
      .then(() => {
        if (!canceled)
          setDraftNotice((notice) =>
            notice === 'restored' ? notice : 'saved'
          );
      })
      .catch(() => {
        if (!canceled) setDraftNotice('error');
      });
    return () => {
      canceled = true;
    };
  }, [
    photos,
    packId,
    resolution,
    requestKey,
    draftReadyFor,
    session.isPending,
    session.data?.user.id,
  ]);
  useEffect(() => {
    trackDance('dance_studio_viewed');
  }, []);
  useEffect(() => {
    if (!session.isPending && session.data?.user)
      trackDance('dance_session_ready');
  }, [session.isPending, session.data?.user.id]);
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
  const photoCount = photos.filter(Boolean).length;
  const missingRole = photos[0] ? 1 : 0;
  const costHeading = useRef<HTMLHeadingElement>(null);
  const hasPhoto = photos.some(Boolean);
  useEffect(() => {
    if (!hasPhoto || !quote) return;
    trackDance('dance_quote_viewed', {
      resolution,
      pack_id: quote.canContinue ? undefined : selectedPlan.id,
      value: quote.canContinue ? 0 : selectedPlan.cents / 100,
      currency: 'USD',
      quote_cents: quote.canContinue ? 0 : selectedPlan.cents,
      stage: 'studio',
    });
  }, [hasPhoto, resolution, quote?.canContinue, selectedPlan]);
  const jobs = useQuery({
    queryKey: ['dance-jobs', session.data?.user.id],
    queryFn: () => apiPost<Job[]>('/api/dance/refresh', {}),
    enabled: !!session.data?.user,
    retry: false,
    refetchIntervalInBackground: false,
    refetchInterval: (query) => {
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
  const currentJob =
    jobs.data?.find((job) => job.id === currentJobId) ||
    jobs.data?.find((job) =>
      ['queued', 'generating', 'reconciling'].includes(job.status)
    );
  useEffect(() => {
    if (currentJob && !currentJobId) setCurrentJobId(currentJob.id);
  }, [currentJob?.id, currentJobId]);
  const featuredJob = currentJob || jobs.data?.[0];
  const visibleJobs = (jobs.data || []).filter(
    (job) =>
      job.id === featuredJob?.id ||
      ['queued', 'generating', 'reconciling'].includes(job.status)
  );
  const historyJobs = (jobs.data || []).filter(
    (job) => !visibleJobs.some((visible) => visible.id === job.id)
  );
  const locatedTask = useRef<string | null>(null);
  useEffect(() => {
    if (!featuredJob || locatedTask.current === featuredJob.id) return;
    if (!['#orders', '#studio-task'].includes(window.location.hash)) return;
    locatedTask.current = featuredJob.id;
    requestAnimationFrame(() =>
      document.getElementById('orders')?.scrollIntoView({ block: 'start' })
    );
  }, [featuredJob?.id]);
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
    onSuccess: async (job) => {
      await qc.cancelQueries({
        queryKey: ['dance-jobs', session.data?.user.id],
      });
      setSubmissionUnknown(false);
      qc.setQueryData<Job[]>(
        ['dance-jobs', session.data?.user.id],
        (existing = []) => [
          job,
          ...existing.filter((item) => item.id !== job.id),
        ]
      );
      setCurrentJobId(job.id);
      const params = {
        resolution: job.resolution,
        simulation: job.simulation,
        payment_mode: job.paymentMode,
      };
      trackDanceOnce(`${job.id}:upload`, 'dance_upload_succeeded', params);
      trackDanceOnce(`${job.id}:queued`, 'dance_generation_queued', params);
      resultObserver.current(job, true);
      checkoutKeys.current = {};
      void clearDanceDraft().catch(() => {});
      setRequestKey(null);
      setPhotos([null, null]);
      setConsent(false);
      setShowHistory(false);
      setPaymentReturn(false);
      window.history.replaceState(
        null,
        '',
        localizeHref(`/?task=${encodeURIComponent(job.id)}#orders`)
      );
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
      setSubmissionUnknown(true);
      trackDance('dance_upload_failed', {
        resolution: draft.resolution,
        reason: danceErrorReason(e),
      });
      if (e.message === 'INSUFFICIENT_CREDITS') {
        setError(m['dance.creditscheckerror']());
        refresh();
      } else {
        setError(t('createerror'));
        setShowHistory(false);
        refresh();
      }
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
  async function generate(
    restoredDraft?: {
      photos: (string | null)[];
      consent: boolean;
      requestKey: string;
      resolution?: DanceResolution;
    },
    afterLogin = false
  ) {
    if (
      previewOnly ||
      paymentUnconfirmed ||
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
    let redirecting = false;
    let openingCheckout = false;
    try {
      draft.requestKey ||= browserUuid();
      setRequestKey(draft.resolution === '720P' ? draft.requestKey : null);
      await saveDanceDraft({
        ...draft,
        packId,
        checkoutKeys: checkoutKeys.current,
        ownerId: session.data?.user.id,
      });
      saved = true;
      if (!session.data?.user) {
        const token = browserUuid();
        await saveDanceLoginIntent(token, {
          photos: draft.photos,
          requestKey: draft.requestKey,
          resolution: draft.resolution,
          packId,
        });
        setLoginToken(token);
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
        if (afterLogin) return; // Show packs; never purchase a default pack implicitly.
        trackDance('dance_credits_required', { resolution: draft.resolution });
        const checkoutKey = (checkoutKeys.current[packId] ||= browserUuid());
        await saveDanceDraft({
          ...draft,
          packId,
          checkoutKeys: checkoutKeys.current,
          ownerId: session.data.user.id,
        });
        openingCheckout = true;
        const result = await checkout.mutateAsync({
          packId,
          requestKey: checkoutKey,
        });
        window.location.assign(
          result.checkoutUrl || localizeHref('/?resume=1#studio')
        );
        redirecting = true;
        return;
      }
      submitted = true;
      await create.mutateAsync(draft);
    } catch (error) {
      if (saved && !submitted)
        trackDance('dance_client_error', {
          stage: openingCheckout ? 'checkout' : 'credits_check',
          reason: danceErrorReason(error),
        });
      if (!saved)
        trackDance('dance_client_error', {
          stage: 'draft_save',
          reason: 'storage_failed',
        });
      if (error instanceof Error && error.message === 'Sign in to continue')
        setLoginOpen(true);
      else if (!submitted)
        setError(
          !saved
            ? m['dance.drafterror']()
            : openingCheckout
              ? m['dance.flow.checkout_error']()
              : m['dance.creditscheckerror']()
        );
    } finally {
      if (!redirecting) {
        submitLock.current = false;
        setPreparing(false);
      }
    }
  }
  useEffect(() => {
    if (
      !loginContinuation ||
      session.isPending ||
      !session.data?.user ||
      draftReadyFor !== session.data.user.id
    )
      return;
    const draft = loginContinuation;
    setLoginContinuation(null);
    void generate(draft, true);
  }, [
    loginContinuation,
    session.isPending,
    session.data?.user.id,
    draftReadyFor,
  ]);
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
  const renderJob = (job: Job) => (
    <article className="dance-order" key={job.id} data-task-id={job.id}>
      <div className="dance-result-meta">
        <span className="dance-chip">
          {job.status === 'deleted'
            ? m['dance.deleted']()
            : job.expired
              ? t('expired')
              : !job.simulation && job.status === 'succeeded'
                ? m['dance.resultready']()
                : t(`status.${job.status}`)}
        </span>
        <p className="dance-order-date">
          {new Date(job.createdAt * 1000).toLocaleString(
            getLocale() === 'zh' ? 'zh-CN' : 'en-US',
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
          typeof job.expiresAt === 'number' && (
            <p className="dance-order-date">
              {m['dance.download_deadline']({
                date: new Date(job.expiresAt * 1000).toLocaleString(
                  getLocale() === 'zh' ? 'zh-CN' : 'en-US',
                  {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  }
                ),
              })}
            </p>
          )}
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
          <p>
            {job.status === 'deleted'
              ? m['dance.deletedinfo']()
              : t('expiredinfo')}{' '}
            <Link href="/contact">{m['settings.nav.tickets']()}</Link>
          </p>
        )}
        {['queued', 'generating', 'reconciling'].includes(job.status) &&
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
                    danceProgress(job, progressNow || Date.now())?.minutes ?? 0,
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
                  job.status === 'reconciling' ? 'reconcileinfo' : 'failureinfo'
                )}
          </p>
        )}
        {['queued', 'generating', 'reconciling'].includes(job.status) &&
          !job.expired &&
          danceProgress(job, progressNow || Date.now())?.delayed && (
            <p className="dance-muted" role="status">
              {m['dance.delivery.wait']()} {m['dance.progress.safe']()}{' '}
              <Link href="/contact">{t('support')}</Link>
            </p>
          )}
      </div>
      {job.status === 'succeeded' && !job.expired && (
        <div className="dance-result-media">
          <DanceVideo
            src={`/api/dance/file?id=${job.id}&slot=video`}
            label={job.simulation ? t('mockresult') : m['dance.realresult']()}
            diagnose={() =>
              qc.fetchQuery({
                queryKey: ['dance-video-status', job.id],
                queryFn: () => readDanceVideoState(job.id),
                staleTime: 0,
                retry: false,
              })
            }
            errorLabels={{
              authentication_required: m['dance.video.auth_required'](),
              video_network: m['dance.video.network'](),
              video_decode: m['dance.video.decode'](),
              video_unsupported: m['dance.video.decode'](),
              video_missing: m['dance.video.missing'](),
              video_expired: m['dance.video.expired'](),
              video_not_ready: m['dance.video.not_ready'](),
              video_unavailable: m['dance.video.unavailable'](),
            }}
            signIn={{
              href: localizeHref('/sign-in?callbackUrl=%2F%23orders'),
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
            {job.simulation ? t('download') : m['dance.downloadreal']()}
          </a>
          <a
            className="dance-another-link"
            href="#studio"
            onClick={() => {
              trackDance('dance_make_another_clicked', {
                resolution: job.resolution,
              });
            }}
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
          onClick={() => action.mutate({ id: job.id, action: 'support' })}
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
  );
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
                setShowHistory(false);
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
              {activeJobs && (
                <span className="dance-task-count">
                  {jobs.data?.filter((job) => !!danceProgress(job)).length}
                </span>
              )}
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
              <div className="dance-mobile-start">
                <a className="dance-primary" href="#studio">
                  {m['dance.guide.start']()} <ArrowUpRight size={18} />
                </a>
                <p>{m['dance.guide.intro']()}</p>
                <p className="dance-entry-price">
                  {m['dance.flow.start_price']()}
                </p>
              </div>
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
                        browser_family: runtimeDiagnostic(
                          undefined,
                          undefined,
                          undefined,
                          window.location.origin,
                          navigator.userAgent
                        ).browser_family,
                      })
                    }
                    onRetry={() =>
                      trackDance('dance_video_retry', { stage: 'example' })
                    }
                    onRecovered={() =>
                      trackDance('dance_video_recovered', { stage: 'example' })
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
              <a className="dance-preview-link" href="#social-examples">
                <Play size={16} />
                {m['dance.social.jump']()}
                <ArrowUpRight size={16} />
              </a>
            </div>
            <div
              id="studio"
              className={`dance-input-panel ${photoCount === 2 ? 'dance-photos-ready' : ''}`}
            >
              <div>
                {paymentReturn && (
                  <div
                    className={`dance-payment-review ${paymentUnconfirmed ? '' : 'is-confirmed'}`}
                    role="status"
                  >
                    {paymentUnconfirmed ? (
                      <AlertCircle size={28} />
                    ) : (
                      <Check size={28} />
                    )}
                    <h2>
                      {paymentReview.isFetching
                        ? m['dance.flow.verifying']()
                        : paymentUnconfirmed
                          ? m['dance.flow.pending']()
                          : m['dance.flow.paid']()}
                    </h2>
                    <p>
                      {paymentUnconfirmed
                        ? m['dance.flow.payment_safe']()
                        : m['dance.flow.paid_next']()}
                    </p>
                    {paymentUnconfirmed &&
                      (session.data?.user ? (
                        <button
                          className="dance-swap-roles"
                          disabled={paymentReview.isFetching}
                          onClick={() => void paymentReview.refetch()}
                        >
                          {m['dance.flow.recheck']()}
                        </button>
                      ) : (
                        <button
                          className="dance-swap-roles"
                          onClick={() => {
                            void saveCurrentDraft()
                              .then(() => setLoginOpen(true))
                              .catch(() => setError(m['dance.drafterror']()));
                          }}
                        >
                          {m['dance.flow.login_verify']()}
                        </button>
                      ))}
                    {paymentUnconfirmed && (
                      <Link href="/contact">{t('support')}</Link>
                    )}
                  </div>
                )}
                {photoCount < 2 && error && (
                  <p className="dance-error" role="alert">
                    {error}
                  </p>
                )}
                <ol
                  className="dance-flow-steps"
                  aria-label={m['dance.guide.intro']()}
                >
                  <li aria-current={photoCount < 2 ? 'step' : undefined}>
                    {m['dance.guide.photos']()}
                  </li>
                  <li aria-current={photoCount === 2 ? 'step' : undefined}>
                    {m['dance.guide.cost']()}
                  </li>
                  <li>{m['dance.guide.result']()}</li>
                </ol>
                <div className="dance-section-title">
                  <h2>
                    {photoCount === 2
                      ? m['dance.flow.photos_ready']()
                      : m['dance.cast.choose']()}
                  </h2>
                </div>
                {photoCount < 2 && (
                  <p className="dance-muted">{m['dance.cast.one']()}</p>
                )}
                <div
                  className="dance-photo-progress"
                  role="status"
                  aria-live="polite"
                >
                  <strong>
                    {m['dance.guide.count']({ count: photoCount })}
                  </strong>
                  <p>
                    {reading
                      ? t('reading')
                      : photoCount === 2
                        ? m['dance.guide.complete']()
                        : photoCount === 0
                          ? m['dance.guide.first']()
                          : m['dance.guide.missing']({
                              role: missingRole === 0 ? 'A' : 'B',
                            })}
                  </p>
                </div>
                {photoCount < 2 && (
                  <details className="dance-photo-specs">
                    <summary>{m['dance.flow.photo_help']()}</summary>
                    <p>{t('limits')}</p>
                  </details>
                )}
                {draftNotice && (
                  <p className="dance-draft-notice" role="status">
                    {draftNotice === 'error'
                      ? m['dance.guide.draft_error']()
                      : draftNotice === 'restored'
                        ? m['dance.guide.draft_restored']()
                        : m['dance.guide.draft_saved']()}
                  </p>
                )}
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
                            !draftReadyFor ||
                            session.isPending ||
                            reading ||
                            create.isPending ||
                            preparing
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
                        <p className="dance-photo-hint">
                          {photoWarnings[index]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                {photoCount < 2 && (
                  <Button
                    className="dance-primary dance-step-next"
                    disabled={
                      !draftReadyFor ||
                      session.isPending ||
                      reading ||
                      preparing ||
                      create.isPending
                    }
                    onClick={() => {
                      if (photoCount < 2)
                        photoInputs.current[missingRole]?.click();
                      else {
                        costHeading.current?.scrollIntoView({ block: 'start' });
                        costHeading.current?.focus({ preventScroll: true });
                      }
                    }}
                  >
                    {reading
                      ? t('reading')
                      : photoCount === 2
                        ? m['dance.guide.next']()
                        : m['dance.guide.pick']({
                            role: missingRole === 0 ? 'A' : 'B',
                          })}
                    <ArrowUpRight size={18} />
                  </Button>
                )}
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

                {photoCount === 2 && (
                  <div className="dance-cast-options">
                    {(!quote || quote.canContinue) && (
                      <h3
                        ref={costHeading}
                        tabIndex={-1}
                        className="dance-cost-heading"
                      >
                        {m['dance.guide.cost_title']()}
                      </h3>
                    )}
                    {session.data?.user &&
                      quote &&
                      !quote.canContinue &&
                      !paymentUnconfirmed && (
                        <fieldset
                          className="dance-inline-packs"
                          disabled={preparing || create.isPending}
                        >
                          <legend>{m['dance.inline.choose']()}</legend>
                          {dancePlans.map((plan) => (
                            <label
                              key={plan.id}
                              className={
                                packId === plan.id ? 'is-selected' : ''
                              }
                            >
                              <input
                                type="radio"
                                name="video-pack"
                                value={plan.id}
                                checked={packId === plan.id}
                                onChange={() => setPackId(plan.id)}
                              />
                              <span>
                                <strong>
                                  {m['dance.inline.count']({
                                    count: plan.videos,
                                  })}
                                </strong>
                                {plan.id === 'friends' && (
                                  <small>{m['dance.pack.recommended']()}</small>
                                )}
                              </span>
                              <span>
                                <strong>{quotePrice(plan.cents)}</strong>
                                <small>
                                  {m['dance.purchase.unitprice']({
                                    price: (
                                      plan.cents /
                                      plan.videos /
                                      100
                                    ).toFixed(2),
                                  })}
                                </small>
                              </span>
                            </label>
                          ))}
                          <p>{m['dance.inline.note']()}</p>
                        </fieldset>
                      )}
                    {!session.data?.user && (
                      <p className="dance-flow-spec">
                        {m['dance.flow.login_balance']()}
                      </p>
                    )}
                    {(!quote || quote.canContinue) && (
                      <div className="dance-cost-summary" aria-live="polite">
                        <p>
                          {!quote
                            ? m['dance.quote.check']()
                            : m['dance.flow.use_count']({
                                count: Math.floor(
                                  quote.remaining / danceCreditCost(resolution)
                                ),
                              })}
                        </p>
                        {quote?.canContinue && (
                          <small>
                            {m['dance.flow.credit_detail']({
                              credits: danceCreditCost(resolution),
                              remaining: quote.remaining,
                            })}
                          </small>
                        )}
                      </div>
                    )}
                    <p className="dance-flow-spec">
                      {m['dance.output.spec']()}
                    </p>
                    <p className="dance-flow-spec">
                      {m['dance.flow.template_note']()}
                    </p>
                    <label className="dance-consent">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      {t('consent')}
                    </label>

                    <div className="dance-checkout-row">
                      <div>
                        <Button
                          className="dance-primary"
                          disabled={
                            previewOnly ||
                            paymentUnconfirmed ||
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
                            : paymentUnconfirmed
                              ? m['dance.flow.pending']()
                              : create.isPending || preparing
                                ? t('checking')
                                : !consent
                                  ? m['dance.guide.consent']()
                                  : !session.data?.user
                                    ? m['dance.guide.signin']()
                                    : quote?.canContinue
                                      ? m['dance.flow.generate_one']()
                                      : quote
                                        ? m['dance.guide.charge']({
                                            price: quotePrice(
                                              selectedPlan.cents
                                            ),
                                          })
                                        : m['dance.quote.check']()}{' '}
                          <ArrowUpRight size={18} />
                        </Button>

                        {import.meta.env.DEV && settings.data?.simulation && (
                          <small>{t('sandbox')}</small>
                        )}
                      </div>
                    </div>
                    <p className="dance-flow-footnote">
                      {paymentUnconfirmed
                        ? m['dance.flow.payment_safe']()
                        : quote?.canContinue
                          ? m['dance.flow.no_auto']()
                          : m['dance.flow.login_next']()}
                    </p>
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

              {(session.data?.user ||
                create.isPending ||
                submissionUnknown) && (
                <section
                  id="orders"
                  className="dance-orders"
                  aria-labelledby="dance-orders-title"
                >
                  <div className="dance-section-title">
                    <h2 id="dance-orders-title">
                      {t('orders')} <span>{jobs.data?.length ?? 0}</span>
                    </h2>
                    <button
                      type="button"
                      disabled={jobs.isFetching}
                      onClick={() => void jobs.refetch()}
                    >
                      {m['dance.progress.refresh']()}
                    </button>
                  </div>
                  {(create.isPending || submissionUnknown) && (
                    <div className="dance-payment-review" role="status">
                      <strong>
                        {create.isPending
                          ? m['dance.flow.submitting']()
                          : m['dance.flow.submission_unknown']()}
                      </strong>
                      <p>{m['dance.flow.task_help']()}</p>
                    </div>
                  )}
                  {jobs.isError && (
                    <div role="alert" className="dance-error">
                      {t('loaderror')}{' '}
                      <button onClick={() => jobs.refetch()}>
                        {t('retry')}
                      </button>
                    </div>
                  )}
                  {jobs.isPending && <p role="status">{t('loading')}</p>}
                  {jobs.data?.length === 0 && <p>{t('empty')}</p>}
                  <div className="dance-results-grid" data-clarity-mask="true">
                    {visibleJobs.map(renderJob)}
                  </div>
                  {historyJobs.length > 0 && (
                    <details
                      className="dance-video-history"
                      open={showHistory}
                      onToggle={(event) =>
                        setShowHistory(event.currentTarget.open)
                      }
                    >
                      <summary>
                        {m['dance.result.history']({
                          count: historyJobs.length,
                        })}
                      </summary>
                      {showHistory && (
                        <div
                          className="dance-results-grid"
                          data-clarity-mask="true"
                        >
                          {historyJobs.map(renderJob)}
                        </div>
                      )}
                    </details>
                  )}
                </section>
              )}
            </div>
          </section>
        </div>
        <DanceSocialExamples />

        <DanceTrend />
        {!paymentUnconfirmed && (
          <DancePricing
            resolution={resolution}
            beforeCheckout={saveCurrentDraft}
          />
        )}
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
        <DanceGuides />
        <DanceClosingCta />
      </main>
      <Suspense fallback={null}>
        {loginOpen && (
          <DanceDialog
            open={loginOpen}
            onOpenChange={(open) => {
              setLoginOpen(open);
              if (!open) {
                clearDanceLoginIntent();
                setLoginToken(null);
              }
            }}
            className="dance-auth-dialog"
            title={m['dance.logintitle']()}
            description={m['dance.loginbody']()}
          >
            <Suspense fallback={<p>{t('loading')}</p>}>
              <SignInForm
                embedded
                returnTo={
                  paymentReturn
                    ? '/?resume=1&payment=review#studio'
                    : loginToken
                      ? `/?resume=1&continueGeneration=${loginToken}#studio`
                      : '/?resume=1#studio'
                }
              />
            </Suspense>
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
          <Link href="/about">{m['dance.about']()}</Link>
          <Link href="/guides">{m['dance.guides.all']()}</Link>
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
  const settings = useQuery({
    queryKey: ['dance-settings'],
    queryFn: () => apiGet<{ simulation: boolean }>('/api/dance/settings'),
  });
  const query = useQuery({
    queryKey: ['admin-dance'],
    queryFn: () => apiGet<Job[]>('/api/admin/dance'),
    refetchInterval: 5000,
  });
  return (
    <section className="p-6">
      <h1 className="mb-6 text-2xl">{t('orders')}</h1>
      {import.meta.env.DEV && settings.data?.simulation && (
        <p>{t('sandbox')}</p>
      )}
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
