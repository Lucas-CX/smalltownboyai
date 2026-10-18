> Historical observation: 2026-10-12. Archived 2026-10-18 from `output/seo-audit-2026-10-12/GEO-AUDIT-REPORT.md`. Not re-tested during archival. Request identifiers, IP addresses and internal deployment identifiers removed; raw logs and HTML remain local.

# Smalltown Boy AI: SEO / GEO 上线审计

- 审计日期：2026-10-12（Asia/Shanghai）
- 线上域名：https://smalltownboyai.video
- 范围：站点地图全部 14 个中英公开页面，robots、llms、JSON-LD、元数据、规范跳转、旧主题路由及首页桌面/移动浏览器抽查。
- 方法：GEO、GEO Audit 技能；直接 HTTP 抓取、XML/HTML 解析、本项目线上 SEO 测试、Chrome 实际渲染与源码交叉核对。
- 本轮只检查，未修改应用源码或线上配置，未提交、部署或触发付费生成。原始证据见同目录 crawl.json 和 HTML 文件。

## 结论

未发现全站禁止索引、站点地图失效、核心公开页面 5xx、canonical 指向旧域名等阻断问题。公开页面的 Smalltown Boy 品牌替换基本完成，但关于页、FAQ 和定价说明仍存在开发阶段措辞及不一致表述。联系渠道和品牌介绍也是目前 GEO 信任信息的主要不足。

不提供 AI 可见性总分：此次没有 Search Console、真实爬虫日志或 ChatGPT/Perplexity 推荐实验，不能把可抓取性等同于收录或推荐。

## 已确认问题

| 优先级 | 问题及线上证据                                                                                                     | 影响与建议                                                                                         | 源码定位（相对项目根目录）                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| P2     | `/about` 和 `/zh/about` 仍写 development sample / 开发样例，简介在摘要和正文重复                                   | 正式改写关于页，说明 Smalltown Boy AI 的实际用途、两张照片双角色、14 秒模板及真实运营信息          | `src/content/pages/about.en.mdx:8`、`:10`；`about.zh.mdx:8`、`:10`                                               |
| P2     | `/pricing` 和 `/zh/pricing` 说贴近参考视频 movement and music / 动作与配乐；首页明确原曲后期加入、交付使用生成音频 | 统一音频承诺，避免用户或 AI 摘要理解为保证复现原曲                                                 | `messages/en.json:1031`、`messages/zh.json:1031`；`src/blocks/dance-pricing.tsx:510`                             |
| P2     | 首页免费生成 FAQ 仍提 demo or test checkout / 演示或测试结账                                                       | 删除开发阶段解释或改为正式产品适用的说明，避免误解当前支付状态；同源 FAQ 会同时进入 llms-full      | `messages/en.json:1312`、`messages/zh.json:1312`                                                                 |
| P2     | `/contact`、`/zh/contact` 仅说明登录后通过已有订单获取帮助；隐私页删除账号请求也导向这里                           | 无订单或无法登录的人没有明确联系路径。补实际可用的公开支持邮箱或联系表单；本轮未验证登录后工单能力 | `src/content/pages/contact.en.mdx:7`、`contact.zh.mdx:7`；`privacy-policy.en.mdx:42`、`privacy-policy.zh.mdx:41` |
| P3     | 中文关于页底链 Video / Pricing / Contact，中文联系页 Privacy / Refunds，隐私页 Support 未翻译                      | 完成中文内容收尾                                                                                   | `src/content/pages/about.zh.mdx:12`、`contact.zh.mdx:9`、`privacy-policy.zh.mdx:41`                              |
| P3     | 英文联系页写 a AI video                                                                                            | 改为 an AI video                                                                                   | `src/content/pages/contact.en.mdx:3`                                                                             |
| P3     | 14 个公开页面均无 `og:image`，也无专门的 Twitter 分享图；Twitter card 为 summary                                   | 补真实品牌/产品分享图与相应元数据。属于分享展示完善，不是索引阻断                                  | `src/lib/dance-seo.ts:25` 起的 meta 配置；证据 `crawl.json`                                                      |
| P3     | About 已在 sitemap 和 llms 中，但首页导航/页脚没有入口，标题只是 About this video tool                             | 关于页重写后补页脚内链，并加入品牌标题，改善用户发现与实体理解                                     | `src/blocks/dance-studio.tsx:1445`；`src/content/pages/about.en.mdx:2`                                           |
| 可选   | sitemap 无 `lastmod`                                                                                               | XML 有效，lastmod 不是必填。若添加，必须使用真实内容更新时间，不要每次请求生成当天日期             | `src/routes/sitemap[.]xml.ts`                                                                                    |
| 可选   | llms-full 有 16 个 FAQ，但没有当前完整美元套餐与分辨率积分表                                                       | 从统一价格数据源生成简明摘要，避免手写漂移；不能据此承诺 AI 推荐提升                               | `src/lib/dance-discovery.ts:15`                                                                                  |

P2 表示建议优先修复的内容/用户预期问题，不代表已证实发生搜索排名或成交损失。

## 旧模板排查

- 14 个线上公开页面的可见内容未发现 Gas Station Dance、GasStationDance、加油站或 ShipAny 品牌残留。
- 本地 `messages/en.json:823,825` 和 `messages/zh.json:823,825` 仍有 ShipAny Next 旧 FAQ/CTA；当前主页面没有使用这些旧块。应记为未使用的源码遗留，不是已确认线上泄漏。
- `dance-*` 文件名、内部模块名及 package 的模板名称不等于用户可见旧品牌，不能仅凭命名判定上线文案错误。

## 已通过的线上检查

1. **站点地图**：`/sitemap.xml` 返回 200，可按 XML 解析，共 14 个唯一页面（7 类页面 × en/zh）；全部目标返回 200，没有旧域名或旧主题页面。
2. **页面元数据**：14 页都有 title、description、单个 H1、自引用 canonical、正确 html lang 和 en/zh/x-default alternates；实际响应均为 index, follow，无 X-Robots-Tag noindex。根布局的默认 noindex 已被公开页正确覆盖。
3. **robots**：`/robots.txt` 返回 200，公开内容允许抓取；后台、设置、登录及 API 路径被排除，站点地图地址正确；OAI-SearchBot 有显式允许公开内容的规则。
4. **抓取样本**：使用 Googlebot、OAI-SearchBot、PerplexityBot 的 User-Agent 从本机请求首页均返回 200 和正确标题。仅为客户端模拟请求，不代表这些平台真实 IP 已成功抓取。
5. **规范跳转**：HTTP 首页、www 首页、`/pricing/`、`/zh/` 均 308 到 HTTPS 非 www 规范地址。
6. **404**：随机不存在路径返回 404；项目线上测试中 10 类旧主题/指南地址的中英版本均返回 404，未重定向成首页软 404。
7. **服务端内容**：无需执行 JavaScript 的 HTML 已包含正文、产品说明、价格及 FAQ，非空壳页面。
8. **结构化数据**：首页包含可解析的 Organization、WebSite、SoftwareApplication、FAQPage；品牌、域名、publisher 关联正确。Offer 的 $7.90 / $19.90 / $29.90 与页面 1/3/5 条 720p 套餐一致。16 个 FAQ 与正文和 llms-full 一致，没有虚构评分。
9. **发现文档**：`/llms.txt` 和 `/llms-full.txt` 返回 200，域名与品牌正确，无旧主题内容。
10. **浏览器抽查**：首页在 390 × 844 和 1440 × 1000 下未发现横向溢出；首屏视频可加载、播放，控制台未出现 error/warn。仅首页抽查，不代替完整跨浏览器回归或真实用户性能测量。

线上执行已有 `tests/dance-seo.mjs`，设置 `SEO_TEST_URL=https://smalltownboyai.video`、`SEO_TEST_INDEXABLE=true`，为请求加 1 秒间隔，输出：

```text
Template pages, metadata, discovery and retired-route checks passed.
```

## 未验证与边界

- **收录**：没有读取 Search Console 的 sitemap 提交状态、URL Inspection 或索引报告。网页搜索工具的两条精确品牌/域名查询未返回结果，直接打开也报工具不可访问；而本机 HTTP 与 Chrome 均可访问。不能将检索工具结果解释为网站宕机或 Google 未收录。
- **GEO 效果**：没有进行真实 AI 推荐测试或完整第三方品牌提及调查。可抓取、schema 有效与 llms 存在都不保证引用。
- **性能**：未跑 Lighthouse、PageSpeed Insights 或读取 CrUX，因此无 Core Web Vitals 达标结论。
- **交易**：未支付、上传照片或触发生成；报价一致性通过不等于支付和交付全链路通过。
- **安全**：抽样首页有 nosniff 和 Referrer-Policy，未观察到 HSTS、CSP、X-Frame-Options。可在独立安全加固中评估，不将其认定为 SEO 阻断或已证实漏洞。

## 建议修复顺序

1. 先改关于页、开发/测试措辞以及价格页音频说明。
2. 补真实公开联系方式，完成中文遗漏与小语法问题。
3. 补 About 内链、品牌分享图，并按真实维护数据选择是否加 sitemap lastmod。
4. 部署后重复本次线上检查，再用 Search Console 核验提交和索引状态。
