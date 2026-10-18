# 分析档案

2026-10-18 从本地 output 整理。用于长期保留历史证据、决策依据及验收边界，不是当前线上状态报告。报告中的“今天”“当前”“未部署”“工作区干净”等只对应原始观察时点；归档不表示相关代码已合并或发布。

## 索引

- [2026-10-14-operations.md](2026-10-14-operations.md)
- [2026-10-14-gsc.md](2026-10-14-gsc.md)
- [2026-10-17-geo.md](2026-10-17-geo.md)
- [2026-10-17-competitors.md](2026-10-17-competitors.md)
- [2026-10-17-ux-audit.md](2026-10-17-ux-audit.md)
- [2026-10-17-production-verification.md](2026-10-17-production-verification.md)
- [2026-10-18-local-e2e.md](2026-10-18-local-e2e.md)
- [2026-10-18-mobile-verification.md](2026-10-18-mobile-verification.md)
- [undated-login-verification.md](undated-login-verification.md)
- [undated-ux-verification.md](undated-ux-verification.md)
- [2026-10-13-release-verification.md](2026-10-13-release-verification.md)
- [2026-10-15-attribution-release.md](2026-10-15-attribution-release.md)
- [2026-10-12-indexing.md](2026-10-12-indexing.md)
- [2026-10-17-operations.md](2026-10-17-operations.md)
- [2026-10-17-operations-aggregates.json](2026-10-17-operations-aggregates.json)

## 数据与脱敏规则

- manifest.json 记录本地来源及转换方式；源文件不保证存在于其他机器。
- 保留汇总指标、日期、统计口径、公开来源和已公开的代码提交标识。小样本业务汇总仍属经营信息，不能声称具备严格统计匿名性。
- 排除客户邮箱/姓名、用户和任务标识、逐笔支付及积分记录、精确交易时间、后台账号/项目标识、私有链接、凭据和本地绝对路径。
- 原始 JSON、数据库、私有媒体、浏览器截图、日志、测试 fixture 与配置保留在本地，不复制进 Git。已归档 JSON 是白名单汇总导出，不是数据库备份。
- 附件引用改为仅本地保留说明；原文普通文本中的附件文件名只是来源说明，不代表仓库包含该文件。
- 竞品报价是当时网页声明，规格和观察时刻不同可能导致报告间差异；不能当作已付费验证的效果或当前价格。
- 收录请求、HTTP 200、站点地图发现、技术可抓取均不等于已收录或 AI 推荐；模拟验收、本地真实生成、生产实收和成功交付分别记录。

## 未归档范围

下载的竞品/社交媒体素材及候选清单、客户支持和故障原始材料、部署输出、配置备份、临时脚本、重复日志未上传。早期 SEO/GSC 调查已补充脱敏报告和公开页面抓取字段；需要原始证据时在授权本地环境读取。此档案不是对 output 的完整复制。

## 补充归档与复盘方法

- [2026-10-12-seo-geo-audit.md](2026-10-12-seo-geo-audit.md)
- [2026-10-12-googlebot-investigation.md](2026-10-12-googlebot-investigation.md)
- [2026-10-12-gsc-followup.md](2026-10-12-gsc-followup.md)
- [2026-10-12-robots-investigation.md](2026-10-12-robots-investigation.md)
- [2026-10-14-funnel-aggregates.json](2026-10-14-funnel-aggregates.json)
- [2026-10-14-gsc-results.json](2026-10-14-gsc-results.json)
- [2026-10-12-public-crawl.json](2026-10-12-public-crawl.json)
- [2026-10-18-workspace-review.md](2026-10-18-workspace-review.md)
- [复盘归档规范](RETROSPECTIVE-GUIDE.md)

来源与转换说明见 [manifest.json](manifest.json)。源文件哈希是本轮整理时计算，历史结论未因此重新验证。
