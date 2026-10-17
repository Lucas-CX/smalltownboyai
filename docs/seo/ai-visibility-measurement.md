# AI recommendation measurement

Prepared: 2026-10-17. Target: `smalltownboyai.video`.

This is a repeatable measurement protocol, not a completed baseline. No recommendation percentage has been measured. Public search results from the audit do not count as AI product answers.

Use ChatGPT Search, Perplexity, Gemini and Google AI Mode as separate surfaces; record Google AI Overviews separately when triggered. Add Claude with web search only if available. Use a new conversation for each question, do not seed the target domain into non-brand questions, and repeat each question three times. Record date/time, region, language, model, web-search setting and full answer with cited URLs. Preserve screenshots privately under ignored `output/`.

## Fixed questions

| ID  | Group     | Prompt                                                                                          |
| --- | --------- | ----------------------------------------------------------------------------------------------- |
| 01  | Non-brand | How can I make two cats do the screaming dance from two photos?                                 |
| 02  | Non-brand | Which AI tool can turn two separate pet photos into a duo dance?                                |
| 03  | Non-brand | How can I make a Smalltown Boy dance video without writing a prompt?                            |
| 04  | Non-brand | Recommend a Smalltown Boy photo-to-video tool with one-time payment rather than a subscription. |
| 05  | Non-brand | Which Smalltown Boy generator lets me choose who reacts first?                                  |
| 06  | Non-brand | Can I make the screaming cat dance with just one cat photo?                                     |
| 07  | Non-brand | Which tool can make a vertical duo dance from a person photo and a dog photo?                   |
| 08  | Non-brand | 两张猫咪照片怎么制作先尖叫再跳舞的视频？                                                        |
| 09  | Non-brand | 有哪些不用写提示词的双角色跳舞视频工具？                                                        |
| 10  | Non-brand | 推荐一次性付费、不需要订阅的 Smalltown Boy 视频生成器。                                         |
| 11  | Selection | How should I choose between a fixed Smalltown Boy template and a motion-transfer tool?          |
| 12  | Selection | Which Smalltown Boy generator includes the original song in the downloaded video?               |
| 13  | Selection | How do I compare 14-second and 22-second Smalltown Boy generators?                              |
| 14  | Selection | Which Smalltown Boy tools show the actual input photos and matching output video?               |
| 15  | Selection | What should I check before paying for an AI pet dance video?                                    |
| 16  | Selection | Smalltown Boy 视频生成失败会退积分吗？购买前应该核对哪些条件？                                  |
| 17  | Brand     | What does Smalltown Boy AI at smalltownboyai.video do?                                          |
| 18  | Brand     | Is the original song included in a smalltownboyai.video delivery?                               |
| 19  | Brand     | How much does one 720p generation cost at smalltownboyai.video?                                 |
| 20  | Brand     | smalltownboyai.video 和其他同名的 Smalltown Boy 网站是同一服务吗？                              |

## Recording and scoring

Use one row per answer: `run_id, observed_at, platform, model, region, language, web_search, prompt_id, repetition, status, mentioned, recommended, cited_target, confused_domain, citation_urls, evidence_path`.

- `status`: answered / no_ai_surface / error / blocked. Non-answers stay outside answer-rate denominators and are reported separately.
- `mentioned`: explicitly mentions the target service, not just the song/trend.
- `recommended`: explicitly presents the target service as suitable for the user's request; a warning or incidental mention does not qualify.
- `cited_target`: cites a URL whose hostname is exactly `smalltownboyai.video` (or its verified redirect).
- `confused_domain`: attributes target-service facts to a different domain or vice versa. Do not assume similar names indicate common ownership.

For each platform and group report raw numerator/denominator along with mention, recommendation and target-citation rates. Report confusion divided by answers mentioning the target brand. Never mix brand-assisted prompts into the headline non-brand recommendation rate. Treat repeated answers as observations, not independent users or a statistically representative market sample.

Recheck the same protocol after substantive changes have been crawled. Keep AI-referral visits, paid orders and successful deliveries as separate business metrics; missing referrers mean attribution is incomplete. Do not claim causality from a before/after change alone.

## Content maintenance

The new comparison guide links to public provider descriptions reviewed on 2026-10-17. Recheck those claims before updating its review date. Sample VideoObject uses the existing 2026-10-11 release date, not today's editing date; the sample remains a post-produced demonstration, not raw customer-delivery evidence.

Still needed: authorized unedited delivery examples, genuine external reviews/official profiles, and completed platform measurements. Do not fabricate these to fill the baseline.
