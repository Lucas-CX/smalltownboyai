# 视频生成模板

## 本地启动

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm db:setup
pnpm db:push
pnpm rbac:init
pnpm dance:fixture
pnpm dev
```

另开终端运行 `pnpm dance:worker`。本地默认模拟支付与生成。通过 `pnpm build` 和 `pnpm dance:test` 验证。

## 更换产品内容

- 品牌、域名：本地环境文件中的 VITE_APP_NAME、VITE_APP_BRAND、VITE_APP_URL、VITE_SEO_URL。
- 首页、价格页与交互文案：messages/_.json。dance._ 键名为了兼容现有代码保留。
- 关于、联系方式与政策：src/content/pages/。上线前填写新产品的真实信息。
- 页面元数据、站点地图、AI 发现：src/lib/dance-seo.ts、dance-discovery.ts。

## 仍保留的开发样例

本次清理的是旧热点的营销内容和历史报告，不是多模板生成引擎重构。
现有生成链路仍使用三个角色槽位、固定参考视频及对应提示词。
更换场景时需要同步修改 src/lib/dance-template.ts（文件、时长、字节数与校验值）、src/core/ai/dance-kie.ts（角色映射和提示词）、src/lib/dance-cast.ts 与 src/core/storage/dance-default-cast.\*（默认角色）、src/lib/dance-media.ts（预览）。
这些样例不能当成新产品的效果证明。新参考视频必须重新检查格式、时长和角色映射；未经验证不要承诺生成效果。

## 部署

生产配置示例已使用占位域名与资源名称。为新产品创建并填写自己的资源，保持 VITE_SITE_INDEXABLE=false，直到新内容与真实流程验收完毕。支付、AI 和邮件凭据在后台配置；不要复制其他产品的生产数据或凭据。

现有 API、表、队列和脚本的 dance 命名保持兼容。上传、订单、积分、支付、任务恢复与管理功能继续保留。
