> 历史归档：2026-10-18 整理自 `output/operations-2026-10-14/followup-delivery.md`。以下状态、价格、测试和部署结论均属于原报告观察时点，本次未重新实测。个人/内部标识已移除；截图、媒体、日志和原始数据库结果未随档案上传。无日期的原报告不推断执行日期。

# 运营改进交付记录

完成于北京时间 2026-10-15。提交 06e9f23，已推送 origin/main；Cloudflare 版本 [内部标识已移除]。

- 专用自测入口： https://smalltownboyai.video/?diagnostic=1 。在 GA 初始配置前屏蔽；Clarity 同样排除。Cookie最长24小时及当前标签页标记跨登录保留。管理员被权限接口识别后自动启用，识别前首屏无法撤回；自测请优先使用专用入口。
- 后台事件保存首次带标签访问的 utm_source/utm_medium/utm_campaign，白名单校验，无需数据库迁移。浏览器中跨中英文页面保留，生产事件接口 accepted=1，D1确认 diagnostic=1且三项字段存储成功。后台按整条flow排除诊断，因此同flow上线前自测也从客户漏斗排除。
- 推广链接生成：node scripts/campaign-link.mjs instagram social launch_20261014。只生成链接，没有发布外部推广或付费广告。
- 主样片已在本地及线上实际播放，媒体readyState=4，播放进度变化。文件H.264 High/yuv420p、AAC-LC、720x1280、14.03秒；未复现原3条异常。增加固定浏览器类别及重试、恢复事件，未声称解决所有设备兼容性。
- 登录页、callbackUrl保留和Google OAuth发起正常。第一次回调网络连接关闭；重试后Google明确显示自动化浏览器可能不安全。已请求用户用日常浏览器完成一次登录回跳确认，端到端Google登录仍未验收。未绕过Google限制。

验证：pnpm build通过（Windows需RUST_MIN_STACK=8388608、RAYON_NUM_THREADS=2）；TypeScript通过；针对性22项、转化59项、正式发布业务40项及发布门禁测试通过；安全扫描10文件无发现，依赖审计无已知漏洞。390/768/1440宽度无横向溢出，英文和中文样片播放正常。当前布局未修改；没有完整跨设备性能结论。26URL线上SEO及公共页回归通过。

发布脚本附带IndexNow请求因ECONNRESET失败，没有重试。没有重新请求Google编入索引。本次发布不证明搜索收录新增。

价格、语言、支付和生成逻辑未改；没有真实付费操作。工作区干净。
