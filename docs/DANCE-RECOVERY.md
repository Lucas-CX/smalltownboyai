# Interrupted generation recovery

Normal delivery uses Kie callbacks. Cloudflare Cron is a bounded fallback, not a persistent worker or a replacement queue.

- Schedule: `*/5 * * * *`, in the root `wrangler.jsonc` (gitignored working configuration) and committed example.
- Idle invocation: one SELECT using `idx_dance_queue`; no database heartbeat, writes, provider queries, or paid submissions.
- Each invocation considers at most four jobs, two concurrently. No new pair starts after 25 seconds. Recovery provider status requests abort at 8 seconds; result transfers at 20 seconds. Database/R2 platform latency is not covered by a whole-invocation hard timeout.
- Known provider tasks have a five-minute status-query backoff, shared by page refreshes and recovery. Valid callbacks bypass this ordinary backoff but never an active result-processing lease. Ordinary callbacks remain the primary delivery path.
- A queued debit or expired preparation lease is failed after five minutes if no paid-call boundary was crossed. The atomic submission fence prevents a resumed preparation worker from submitting after recovery.
- Once the paid-call boundary is crossed, an unknown outcome is never resubmitted. A verified callback can recover the existing provider task. Thirty minutes after the debit, non-delivery is compensated; this is not evidence that Kie did not charge.
- Compensation timing includes cron cadence, active leases and any backlog; 30 minutes is the eligibility threshold, not a strict delivery/refund SLA.
- Failure is durable before the original consumption is restored in an atomic D1 batch. Repeated callbacks, overlapping recovery and a crash before refund cannot double-credit. Refunded rows leave the due index range; successful/removed rows are excluded by status.
- The cron hook is not exposed through an application HTTP endpoint. Preview mode performs no recovery.

Verification: `pnpm dance:test`, `pnpm exec tsc --noEmit`, `pnpm build` / Cloudflare build, security scan, and the standard `pnpm run cf:deploy` gates. `tests/dance-submission-flow.test.ts` uses an isolated in-memory database with real schema, ledger and orchestration; provider/R2 calls are fixtures. No paid generation is needed for regression tests.

Observe `Dance recovery completed` in Cloudflare logs (checked/errors/deferred counts only). Empty runs should show checked=0. A sustained backlog or errors requires investigation rather than increasing the cron frequency blindly.

Local workerd validation: the Wrangler 4.98 static-asset proxy returns an exception for its synthetic scheduled endpoint before reaching the application. Test the identical generated Worker using an isolated local config without the assets router; do not remove production assets. The local scheduled test recovered a preparation-interrupted fixture, restored 100 credits once, and returned checked=0 on replay. Verify the real deployed Cron separately.
