import { CloudflareEmailProvider } from './cloudflare';
import type { EmailProvider } from './index';
import { ResendProvider } from './resend';

export function emailConfigurationHealth(
  configs: Record<string, string>,
  bindingAvailable = !!(
    (globalThis as any).__CF_ENV__?.EMAIL ?? (globalThis as any).__env__?.EMAIL
  )
) {
  const provider = configs.email_provider || 'resend';
  const required =
    provider === 'cloudflare'
      ? bindingAvailable
        ? ['cloudflare_email_sender_email']
        : [
            'cloudflare_email_api_token',
            'cloudflare_email_account_id',
            'cloudflare_email_sender_email',
          ]
      : provider === 'resend'
        ? ['resend_api_key', 'resend_sender_email']
        : [];
  const missing = required.filter((key) => !configs[key]?.trim());
  const sender =
    configs[
      provider === 'cloudflare'
        ? 'cloudflare_email_sender_email'
        : 'resend_sender_email'
    ] || '';
  const validSender = /^(?:[^<>\r\n]+<)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(
    sender.trim()
  );
  return {
    provider,
    configured: required.length > 0 && missing.length === 0 && validSender,
    missing,
    validSender,
    transport:
      provider === 'cloudflare' && bindingAvailable
        ? 'workers-binding'
        : 'rest',
    deliveryVerified: false,
    notificationsEnabled: false,
  };
}

export function configuredEmailProvider(
  configs: Record<string, string>
): { provider: EmailProvider; from: string } | null {
  const health = emailConfigurationHealth(configs);
  if (!health.configured) return null;
  if (health.provider === 'cloudflare') {
    const from = configs.cloudflare_email_sender_email;
    return {
      provider: new CloudflareEmailProvider({
        apiToken: configs.cloudflare_email_api_token,
        accountId: configs.cloudflare_email_account_id,
        defaultFrom: from,
        binding:
          (globalThis as any).__CF_ENV__?.EMAIL ??
          (globalThis as any).__env__?.EMAIL,
      }),
      from,
    };
  }
  const from = configs.resend_sender_email;
  return {
    provider: new ResendProvider({
      apiKey: configs.resend_api_key,
      defaultFrom: from,
    }),
    from,
  };
}
