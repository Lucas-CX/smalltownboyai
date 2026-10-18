> 历史归档：2026-10-18 整理自 `output/real-e2e/unified-mobile-verification.md`。以下状态、价格、测试和部署结论均属于原报告观察时点，本次未重新实测。个人/内部标识已移除；截图、媒体、日志和原始数据库结果未随档案上传。无日期的原报告不推断执行日期。

# Mobile unified videos verification

- Viewport: 390 x 844; no horizontal overflow.
- Real result: one task card and one video player; auto anchor top about 88px.
- Actual playback observed paused=false and currentTime advancing; duration 14.025011 seconds.
- Download clicked, saved generated-video (1).mp4; SHA256 matches previous verified real file.
- Isolated localhost:3002 fixture: history defaults closed, expands to distinct task cards, closes after reload.
- Uploaded both fictional photos; reload restored draft and unchecked consent, with no generation request.
- One explicit simulated generate click: exactly one /api/dance/ request; new task shown and scrolled to top about 88px, URL task=local-task-001#orders.
- Simulated completion replaces task progress with player/download; reload does not resubmit.
- Real ledger still one job and one -150 consume; no new provider call or payment.
- No application code changed this turn; no deployment. Fixture proxy stopped after verification; local dev preview remains running.
