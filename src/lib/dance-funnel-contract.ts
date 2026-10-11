import { z } from 'zod';

import type { ConversionDay } from './dance-reporting';

export const clientFunnelEvents = [
  'dance_quote_viewed',
  'dance_resolution_changed',
  'dance_photo_picker_opened',
  'dance_photo_picker_canceled',
  'dance_purchase_restored',
  'dance_article_studio_clicked',
  'dance_studio_viewed',
  'dance_auth_started',
  'dance_auth_failed',
  'dance_session_ready',
  'dance_draft_restored',
  'dance_draft_missing',
  'dance_purchase_shown',
  'dance_purchase_closed',
  'dance_purchase_cta_viewed',
  'dance_purchase_cta_state',
  'dance_purchase_more_opened',
  'dance_purchase_continue_clicked',
  'dance_make_another_clicked',
  'dance_photo_selected',
  'dance_photo_ready',
  'dance_photo_failed',
  'dance_generate_clicked',
  'dance_login_required',
  'dance_credits_required',
  'dance_upload_started',
  'dance_upload_succeeded',
  'dance_upload_failed',
  'dance_generation_queued',
  'dance_generation_succeeded',
  'dance_generation_failed',
  'dance_download_clicked',
  'dance_video_failed',
  'dance_video_retry',
  'dance_video_recovered',
  'dance_pack_selected',
  'begin_checkout',
  'dance_checkout_ready',
  'dance_checkout_failed',
  'dance_client_error',
  'purchase',
  'dance_test_purchase',
  'dance_checkout_canceled',
] as const;
export const serverFunnelEvents = [
  'server_registered',
  'server_session_created',
  'server_checkout_created',
  'server_payment_verified',
  'server_generation_queued',
  'server_generation_succeeded',
  'server_generation_failed',
  'server_generation_review',
  'server_payment_return_failed',
] as const;
export const funnelReasons = [
  'email_not_verified',
  'invalid_credentials',
  'rate_limited',
  'auth_service_unavailable',
  'auth_failed',
  'insufficient_credits',
  'authentication_required',
  'upload_too_large',
  'invalid_upload',
  'network_or_client',
  'request_failed',
  'storage_failed',
  'invalid_image',
  'file_too_large',
  'unsupported_format',
  'image_decode_failed',
  'image_too_small',
  'image_dimensions_exceeded',
  'image_aspect_ratio',
  'image_processing_failed',
  'simulated_failure',
  'provider_failure',
  'submission_review',
  'payment_unconfirmed',
  'session_loading',
  'credits_loading',
  'credits_unavailable',
  'checkout_pending',
  'ready',
  'dismissed',
  'back_to_studio',
  'uncaught_error',
  'unhandled_rejection',
  'heic_not_supported',
  'image_decode_timeout',
  'image_resize_unavailable',
  'video_aborted',
  'video_network',
  'video_decode',
  'video_unsupported',
  'video_unknown',
  'video_missing',
  'video_expired',
  'video_not_ready',
  'video_unavailable',
] as const;
export const DANCE_CONVERSION_VERSION = 'conversion_20261010_quote' as const;
export const funnelParamsSchema = z
  .object({
    audience_version: z.literal('market_20261011').optional(),
    browser_language: z
      .string()
      .max(35)
      .regex(/^(?:unknown|[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*)$/)
      .optional(),
    page_locale: z.enum(['en', 'zh']).optional(),
    geo_country: z
      .string()
      .regex(/^(?:[A-Z]{2}|unknown)$/)
      .optional(),
    geo_source: z.enum(['cloudflare', 'unknown']).optional(),
    conversion_version: z
      .enum([
        'conversion_20261009',
        'conversion_20261009_evening',
        DANCE_CONVERSION_VERSION,
      ])
      .optional(),
    error_kind: z
      .enum([
        'TypeError',
        'ReferenceError',
        'SyntaxError',
        'RangeError',
        'Other',
      ])
      .optional(),
    error_source: z.enum(['first_party', 'third_party', 'opaque']).optional(),
    error_line: z.number().int().min(0).max(1_000_000).optional(),
    error_fingerprint: z
      .string()
      .regex(/^[a-f0-9]{8}$/)
      .optional(),
    browser_family: z
      .enum(['edge', 'firefox', 'chrome', 'safari', 'other'])
      .optional(),
    entry_article: z
      .enum(['what-is-gas-station-dance', 'other_guide'])
      .optional(),
    source_mime: z
      .enum([
        'image/jpeg',
        'image/jpg',
        'image/pjpeg',
        'image/png',
        'image/webp',
        'image/bmp',
        'image/x-ms-bmp',
        'image/avif',
        'image/heic',
        'image/heif',
        'application/octet-stream',
        'empty',
        'other',
      ])
      .optional(),
    source_bytes: z.number().int().min(0).max(1_000_000_000).optional(),
    source_width: z.number().int().min(1).max(120_000).optional(),
    source_height: z.number().int().min(1).max(120_000).optional(),
    photo_stage: z
      .enum(['selection', 'decode', 'validation', 'encoding', 'ready'])
      .optional(),
    photo_rule: z.enum(['wan3_photo_v2', 'wan3_photo_v3']).optional(),
    quote_cents: z.number().int().min(0).max(100000).optional(),
    photo_decoder: z.enum(['bitmap', 'image']).optional(),
    photo_count: z.number().int().min(1).max(3).optional(),
    default_roles: z.number().int().min(0).max(2).optional(),
    role: z.enum(['left', 'right', 'car']).optional(),
    resolution: z.enum(['480P', '720P', '1080P']).optional(),
    reason: z.enum(funnelReasons).optional(),
    stage: z
      .enum([
        'hero',
        'studio',
        'article',
        'generation',
        'checkout',
        'draft_save',
        'draft_restore',
        'credits_check',
        'example',
        'result',
        'google',
        'github',
        'email',
        'purchase',
        'runtime',
      ])
      .optional(),
    pack_id: z.enum(['single', 'friends', 'collection']).optional(),
  })
  .strip();
export const funnelBatchSchema = z
  .object({
    flowId: z.string().uuid(),
    diagnostic: z.boolean().default(false),
    events: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            event: z.enum(clientFunnelEvents),
            locale: z.enum(['en', 'zh']).default('en'),
            params: funnelParamsSchema.default({}),
          })
          .strict()
      )
      .min(1)
      .max(20),
  })
  .strict();
export type FunnelParams = z.infer<typeof funnelParamsSchema>;
export type FunnelRecord = {
  id: string;
  flowId: string;
  userId: string | null;
  event: string;
  source: string;
  locale: string;
  device: string;
  params: string;
  resourceId: string | null;
  mode: string;
  diagnostic: boolean;
  createdAt: Date;
};
export type FunnelJourney = {
  flowId: string;
  userRef: string | null;
  firstAt: string;
  lastAt: string;
  lastEvent: string;
  locale: string;
  device: string;
  outcome: string;
  eventCount: number;
};
export type FunnelReport = {
  daily: ConversionDay[];
  timezone: string;
  generatedAt: string;
  since: string;
  totalFlows: number;
  totalEvents: number;
  page: number;
  stages: { key: string; flows: number }[];
  journeys: FunnelJourney[];
  errors: { event: string; params: string; source: string; total: number }[];
  timeline: {
    id: string;
    event: string;
    source: string;
    params: FunnelParams;
    createdAt: string;
    mode: string;
  }[];
};
export const funnelStages = [
  { key: 'visit', events: ['dance_studio_viewed'] },
  { key: 'photos', events: ['dance_photo_ready'] },
  { key: 'generate', events: ['dance_generate_clicked'] },
  { key: 'registered', events: ['server_registered'] },
  { key: 'login', events: ['server_session_created'] },
  { key: 'returned', events: ['dance_session_ready'] },
  { key: 'draft', events: ['dance_draft_restored'] },
  { key: 'offer', events: ['dance_purchase_shown'] },
  { key: 'pack', events: ['dance_pack_selected'] },
  { key: 'checkout', events: ['server_checkout_created'] },
  { key: 'paid', events: ['server_payment_verified'] },
  { key: 'queued', events: ['server_generation_queued'] },
  { key: 'succeeded', events: ['server_generation_succeeded'] },
] as const;

export function journeyOutcome(events: FunnelRecord[], now = Date.now()) {
  const sorted = [...events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  if (!sorted.length) return 'unknown';
  const unresolved = new Map<string, number>();
  let paid = false,
    queued = false,
    succeeded = false;
  for (const row of sorted) {
    const p = JSON.parse(row.params || '{}') as FunnelParams;
    const e = row.event;
    if (e === 'server_payment_verified') {
      paid = true;
      unresolved.delete('checkout');
    }
    if (e === 'server_generation_queued') {
      queued = true;
      unresolved.delete('upload');
    }
    if (e === 'server_generation_succeeded') {
      succeeded = true;
      unresolved.delete('generation');
    }
    if (e === 'server_session_created' || e === 'dance_session_ready')
      unresolved.delete('auth');
    if (e === 'dance_draft_restored') unresolved.delete('draft');
    if (e === 'dance_purchase_shown' || e === 'dance_upload_started')
      unresolved.delete('credits');
    if (e === 'server_checkout_created') unresolved.delete('checkout');
    if (e === 'dance_photo_ready')
      unresolved.delete(`photo:${p.role || 'unknown'}`);
    if (e === 'dance_photo_failed')
      unresolved.set(`photo:${p.role || 'unknown'}`, row.createdAt.getTime());
    if (e === 'dance_auth_failed')
      unresolved.set('auth', row.createdAt.getTime());
    if (e === 'dance_checkout_failed' || e === 'server_payment_return_failed')
      unresolved.set('checkout', row.createdAt.getTime());
    if (e === 'dance_upload_failed' && p.reason !== 'insufficient_credits')
      unresolved.set('upload', row.createdAt.getTime());
    if (e === 'server_generation_failed' || e === 'server_generation_review')
      unresolved.set('generation', row.createdAt.getTime());
    if (e === 'dance_draft_missing')
      unresolved.set('draft', row.createdAt.getTime());
    if (e === 'dance_client_error')
      unresolved.set(
        p.stage === 'credits_check' ? 'credits' : 'draft',
        row.createdAt.getTime()
      );
  }
  // Authoritative completion wins over delayed browser errors. Lack of later
  // events is an inference, never proof that a user abandoned a purchase.
  if (unresolved.size) return 'technical';
  if (succeeded) return 'succeeded';
  if (queued)
    return now - sorted.at(-1)!.createdAt.getTime() > 30 * 60_000
      ? 'pending_review'
      : 'generating';
  if (paid) return 'paid';
  if (now - sorted.at(-1)!.createdAt.getTime() < 30 * 60_000) return 'active';
  if (
    events.some((e) =>
      [
        'dance_purchase_shown',
        'server_checkout_created',
        'dance_pack_selected',
        'dance_checkout_canceled',
      ].includes(e.event)
    )
  )
    return 'purchase_dropoff';
  return 'unknown';
}
