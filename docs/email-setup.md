# SmalltownBoyAI email setup

Verified on 2026-10-11 (Asia/Shanghai).

## Domain services

- Cloudflare zone: `80a8181e332811a91bdafca80f6f055f` (active).
- Nameservers: `meera.ns.cloudflare.com`, `phil.ns.cloudflare.com`.
- Incoming: `support@smalltownboyai.video` forwards to the owner's verified Gmail destination.
- Outgoing: `notifications@smalltownboyai.video`, with `Reply-To: support@smalltownboyai.video`.
- Email Routing is enabled and ready. Email Sending is enabled for the root domain.
- Cloudflare manages routing MX/SPF/DKIM and outbound `cf-bounce` MX/SPF/DKIM plus DMARC.
- Direct outbound and support-forwarding test messages reached the owner's Gmail inbox. Gmail reported SPF, DKIM and DMARC pass on the outbound message.

## Website deployment configuration (pending deployment)

There is no deployed SmalltownBoyAI Worker or project-specific `wrangler.jsonc` yet. The mail infrastructure verification does not verify a deployed signup, password reset or notification flow.

Merge the following into the site's actual Wrangler configuration during deployment:

```json
{
  "send_email": [
    {
      "name": "EMAIL",
      "allowed_sender_addresses": ["notifications@smalltownboyai.video"]
    }
  ]
}
```

In `/admin/settings`, configure these database-backed settings:

| Setting                         | Value                                |
| ------------------------------- | ------------------------------------ |
| `email_provider`                | `cloudflare`                         |
| `cloudflare_email_sender_email` | `notifications@smalltownboyai.video` |

With the `EMAIL` Workers binding, no API token is needed in app settings. Do not copy the local Wrangler OAuth token into the application. It is only a short-lived CLI credential.

Use `support@smalltownboyai.video` as the `replyTo` value for customer-facing messages. Configure email verification only after the deployed signup and password-reset flows have been tested with a real inbox. Notification jobs also need their own delivery checks; enabling a sending domain does not enable notification jobs.

The REST adapter maps recipients to arrays, `replyTo` to `reply_to`, and reads `message_id`. The Workers binding retains its own camelCase contract.

## Verification evidence

- Outbound subject: `SmalltownBoyAI outbound verification 20261011-01`.
- Outbound message ID: `<dFFcJQnTvtDKfi4yCmpH2i2iuzYcsAMXUcG1@smalltownboyai.video>`.
- Forwarding subject: `SmalltownBoyAI inbound forwarding verification 20261011-02`.
- Forwarding message ID: `<P30NlXvx7ODeKccnR9iiYMkqbNY51hOEJtDU@smalltownboyai.video>`.
- Actual application REST adapter test subject: `SmalltownBoyAI application adapter verification 20261011-03`; Gmail inbox receipt verified.
- Adapter test message ID: `<rLROHCnoT0gMYOzFOmOoD70PYi1hYxp6KGyR@smalltownboyai.video>`.
- Five email regression tests passed; `pnpm build` passed. The actual Workers binding and deployed authentication journeys remain untested.
- DNSSEC at the registrar was disabled for migration. Re-enable using Cloudflare's DS values separately; do not restore the old Spaceship DS record.
