import { render } from '@react-email/components';

import type {
  EmailConfigs,
  EmailMessage,
  EmailProvider,
  EmailSendResult,
} from '.';

/**
 * Cloudflare Email Service provider configs
 * @docs https://developers.cloudflare.com/email-service/get-started/send-emails/
 */
export interface CloudflareEmailConfigs extends EmailConfigs {
  apiToken?: string;
  accountId?: string;
  defaultFrom?: string;
  binding?: {
    send(message: Record<string, unknown>): Promise<{ messageId: string }>;
  };
}

/**
 * Cloudflare Email Service provider implementation
 * Uses the REST API: POST /client/v4/accounts/{account_id}/email/sending/send
 */
export class CloudflareEmailProvider implements EmailProvider {
  readonly name = 'cloudflare';
  configs: CloudflareEmailConfigs;

  constructor(configs: CloudflareEmailConfigs) {
    this.configs = configs;
  }

  async sendEmail(email: EmailMessage): Promise<EmailSendResult> {
    try {
      const from = email.from || this.configs.defaultFrom || '';
      const to = email.to;

      let html = email.html;
      if (email.react) {
        html = await render(email.react);
      }

      const body: Record<string, any> = {
        from,
        to,
        subject: email.subject,
      };

      if (html) body.html = html;
      if (email.text) body.text = email.text;
      if (!html && !email.text) body.text = '';
      if (email.replyTo) body.replyTo = email.replyTo;
      if (email.cc) body.cc = email.cc;
      if (email.bcc) body.bcc = email.bcc;
      if (email.headers) body.headers = email.headers;

      if (email.attachments?.length)
        throw new Error('Attachments are not supported by this provider');
      if (this.configs.binding) {
        const result = await this.configs.binding.send(body);
        if (!result.messageId)
          throw new Error('Email service did not return a message ID');
        return {
          success: true,
          messageId: result.messageId,
          provider: this.name,
        };
      }
      if (!this.configs.apiToken || !this.configs.accountId)
        throw new Error('Cloudflare Email is not configured');

      const url = `https://api.cloudflare.com/client/v4/accounts/${this.configs.accountId}/email/sending/send`;

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.configs.apiToken}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });

      const data: any = await resp.json().catch(() => ({}));

      if (!resp.ok || data.success !== true) {
        const errMsg =
          data?.errors?.[0]?.message ||
          data?.messages?.[0] ||
          `Request failed (${resp.status})`;
        return {
          success: false,
          error: errMsg,
          provider: this.name,
        };
      }

      if (data?.result?.permanent_bounces?.length)
        return {
          success: false,
          error: 'Recipient delivery failed',
          provider: this.name,
        };
      if (!data?.result?.delivered?.length && !data?.result?.queued?.length)
        return {
          success: false,
          error: 'No recipient accepted',
          provider: this.name,
        };
      return {
        success: true,
        messageId: data?.result?.messageId || undefined,
        provider: this.name,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: this.name,
      };
    }
  }
}

/**
 * Create Cloudflare Email provider with configs
 */
export function createCloudflareEmailProvider(
  configs: CloudflareEmailConfigs
): CloudflareEmailProvider {
  return new CloudflareEmailProvider(configs);
}
