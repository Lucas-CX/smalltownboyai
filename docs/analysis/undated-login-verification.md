> 历史归档：2026-10-18 整理自 `output/login-task-verification.md`。以下状态、价格、测试和部署结论均属于原报告观察时点，本次未重新实测。个人/内部标识已移除；截图、媒体、日志和原始数据库结果未随档案上传。无日期的原报告不推断执行日期。

# Local login continuation and task feedback verification

Scope: messages/en.json, messages/zh.json, package.json, src/blocks/dance-studio.tsx, src/styles/dance.css, src/lib/dance-login-intent.ts, tests/dance-login-intent.test.ts. Other concurrent video/media changes in the workspace were not edited for this task.

- Production build and TypeScript check passed locally. No commit or deployment.
- Conversion suite: 60 passed, including one-use login intent tests.
- Targeted draft/login/payment journey: 4 passed.
- Generation/payment/ledger suite: 48 passed on serial run; auth callback subprocess initially hit native memory failure, then all 3 callback tests passed alone. Submission flow: 9 passed after stopping the local Vite server to release memory. Initial parallel run exited with Windows native memory error; no assertion failure remained on rerun.
- Browser at 390px: independent top login works with zero photos. Anonymous photo form has no inline pack choices. Explicit login return with sufficient mock credits generated once, with no checkout call. Task card appears in studio and updates queued -> generating; header shows active count.
- Zero-credit login return retained photos and consent and presented default 3-pack, without generating or purchasing. Refresh retained photos/pack and reset consent, without another mutation.
- Request log after these scenarios contained exactly one /api/dance/ generation POST and zero /api/dance/credits checkout POSTs.
- Login continuation is separate from draft: ten-minute nonce bound to photo snapshot/request key/quality/pack, consumed before async verification, rejected for reload/back/unknown navigation and invalid/expired/mismatched tokens. Existing server idempotency keys unchanged.
- Local UI uses an ignored proxy on 3001 with simulated auth/balance/tasks; all mutations terminate there. Actual application preview on 3000. No real payments or paid generation.

Screenshots: login-first-mobile.png, login-task-mobile-status.png.
