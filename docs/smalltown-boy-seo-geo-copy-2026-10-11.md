# SmalltownBoyAI：搜索需求、竞品缺口与页面文案方案

调研日期：2026-10-11（Asia/Shanghai）。目标站点：smalltownboyai.video。英文搜索为主，中文提供对应文案；不据此推断美国是主要付费市场。

## 1. 核心决策

首页定位为 **Smalltown Boy AI Dance Video Generator**，承接“想做同款”的需求；用解释区承接“这是什么舞／什么歌”，用 FAQ 承接“用什么工具、怎么做、要几张图、多少钱、能否做猫、会不会失败”。不要把页面写成泛泛的 80s neon dance，也不要只反复出现品牌词 smalltownboyai。

推荐价值主张：**先看清模板，再把自己放进这段舞。** 首屏展示实际生成样例，紧接角色说明、输出规格和实际最低购买金额。准确的规格与可核验的结果，比“viral / perfect / instant”更值得作为差异化。

本次交付是研究与完整文案设计，不是生成能力改造或上线。现有工作区有大量先前修改，本次不覆盖它们。

### 产品事实边界

调研期间工作区有其他并行修改。首次检查仍是三角色旧模板；交付前复查已切换为 Smalltown Boy 两角色、14 秒参考。以下以复查代码为准；代码配置不等于已验证的真实成片：

| 核验文件                                               | 当前观察                                                                          | 对文案的限制                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `docs/TEMPLATE.md`                                     | 复查时仍说明三角色旧模板，与新代码不同步                                          | 文档需随实现更新；旧样例不能作为新热点效果证明            |
| `src/core/ai/dance-kie.ts`                             | 已改为两张角色图；开场特写与背景舞者；14 秒、9:16 请求                            | 可按双人路线设计；不能承诺 21/22 秒完整复刻或实际生成效果 |
| `src/lib/dance-template.ts`                            | `smalltown-red-fence-v1-14s`，参考与输出配置均为 14 秒                            | 页面规格应与这一配置同步；最终交付仍需实际验收            |
| `src/blocks/dance-studio.tsx`、`src/lib/dance-cast.ts` | 已改为两槽位、两张必填；默认 720p；登录与订单恢复                                 | 可采用两图文案；默认档位的实际购买金额尤其需要清楚        |
| `src/lib/dance-plans.ts`                               | 100/150/250 积分分别对应 480p/720p/1080p；套餐 $9.90/100、$32.90/400、$74.90/1000 | 是当前代码价格，不等于新模板已开售价格                    |
| `src/modules/dance/service.ts`                         | 订单创建时设置 24 小时文件访问期限                                                | 不应写“生成完成后保留 24 小时”                            |
| `src/lib/dance-faq.ts`                                 | FAQ 同时供页面、JSON-LD、llms-full.txt 使用                                       | 后续保持单一内容源，防止规则矛盾                          |

下文“上线稿”以双人模板完成验证为前提；宠物、音轨、水印、耗时与价格分别验收。可以先发布知识型内容，但未通过验收的功能不能包装成现已可用。

## 2. 证据分级与搜索词

- **A：搜索联想观察**——本次从 Google suggest 接口取得，参数 `client=firefox&hl=en&gl=us`。这是英文／美国参数下的单次快照，不是搜索量、排名或受众国家证明。
- **B：公开内容观察**——工具页、模板页、教程确实使用该词或回答该问题；证明已有内容供给，不证明有多少人搜索。
- **C：需求假设**——根据任务流程推导的长尾和 AI 问法。需要上线后的 GSC、站内搜索、客服问题等验证。

本次没有 Keyword Planner/Ahrefs/Semrush 月搜索量，也没有任何 ChatGPT、Gemini 或 Perplexity 的用户提问日志。没有把 AI 自己生成的问句伪装成真实用户数据。

### Google 联想快照

| 输入                                                                                                                                      | 相关返回值                                                                                      | 解读                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `smalltown boy`                                                                                                                           | smalltown boy lyrics / bronski beat / dance / song / meaning / release date / remix             | 大词混合音乐欣赏、歌词和舞蹈需求             |
| `smalltown boy dance`                                                                                                                     | smalltown boy dance meme / challenge / parents / trend / tiktok / moves / remix / version / mix | 舞蹈及趋势词有直接联想证据，但新旧趋势混合   |
| `smalltown boy trend`                                                                                                                     | smalltown boy trend / trend tiktok / dance trend                                                | 保留与主题有关的返回项；忽略无关泛词         |
| `two cats dancing`                                                                                                                        | two cats dancing meme / video / tiktok / song / gif / together                                  | 有视觉描述式搜索；不能全归因于 Smalltown Boy |
| `smalltown boy ai`、`small town boy ai`、`smalltown boy cats`、`smalltown boy ai how`、`smalltown boy ai free`、`smalltown boy dance how` | 空数组                                                                                          | 无联想不等于无需求，也不能宣布是高搜索量词   |
| `smalltown boy template`                                                                                                                  | 返回 meaning / video meaning 等偏离目标项                                                       | 不当作 template 高需求的证据                 |

复查入口：[舞蹈词联想](https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=smalltown%20boy%20dance)、[趋势词联想](https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=smalltown%20boy%20trend)、[双猫词联想](https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=two%20cats%20dancing)。响应会变化，以上文字为本次记录。

### 关键词 → 意图 → 页面位置

优先级按产品匹配度和转化距离判断，不是流量大小排序。

| 优先级 | 词组                                                                            | 证据                | 用户要解决什么               | 落点                           |
| ------ | ------------------------------------------------------------------------------- | ------------------- | ---------------------------- | ------------------------------ |
| P0     | smalltown boy ai video generator; smalltown boy ai dance generator              | B，见 S1–S4         | 找可用工具                   | 首页 Title、H1、生成区         |
| P0     | how to make a smalltown boy ai video; how to do the smalltown boy ai trend      | B，见 S2/S3         | 知道具体制作方法             | 三步教程、FAQ 3                |
| P0     | smalltown boy dance trend; smalltown boy dance meme; smalltown boy dance tiktok | A                   | 识别热点并参与               | 首屏说明、趋势解释、FAQ 1      |
| P1     | smalltown boy cats; smalltown boy ai cat dance; smalltown boy dancing cats      | B，见 S3/S5         | 做双猫版本                   | 宠物样例与 FAQ 7；验收后再主推 |
| P1     | two cats dancing meme; two cats dancing song                                    | A，宽泛             | 不知道名称，凭画面找视频或歌 | 解释区、FAQ 1/2                |
| P1     | smalltown boy capcut template                                                   | B，见 S6/S7         | 找同款模板或免费路径         | FAQ 8、教程中的选择标准        |
| P1     | smalltown boy ai prompt                                                         | B，见 S3/S5         | 找提示词或自主生成方法       | FAQ 4；后续独立教程            |
| P1     | smalltown boy ai free; smalltown boy ai without watermark                       | B，见 S2            | 先判断成本、下载限制         | 价格区、FAQ 9/10/13            |
| P2     | smalltown boy ai one photo; smalltown boy ai with a friend                      | B，见 S2            | 确认输入与组合要求           | FAQ 5/6                        |
| P2     | smalltown boy ai faces changing; smalltown boy ai failed                        | C                   | 修复效果或任务问题           | FAQ 14/15                      |
| P2     | smalltown boy ai music missing; smalltown boy ai 14 vs 21 seconds               | C，来自竞品规格差异 | 明确买到的版本               | 规格卡、FAQ 11/12              |

中文候选：`Smalltown Boy AI 视频怎么做`、`Smalltown Boy 双猫跳舞`、`两只猫尖叫跳舞是什么歌`、`Smalltown Boy 模板`、`Smalltown Boy 提示词`。本次未采集中文联想或中文搜索量，全部作为 C 级本地化候选。

**不优先争抢：**裸词 smalltown boy、lyrics、mp3 download、整首歌含义、泛 80s music。它们与生成付费距离较远。`small town boy` 变体自然出现在正文一次即可，无须建立重复页面。`SmalltownBoyAI` 是本站品牌；`Smalltown Boy` 是趋势／歌曲实体；同名 `.com` 是本次比较对象，不是本站。

## 3. 竞品覆盖与真正的机会

观察的是公开页面文案，没有购买、生成或验证竞争产品交付效果。下表的“缺口”限定在本次读取页面，不代表整个网站从未提供相关说明。

| 页面                                                                             | 已经覆盖                                                                     | 我们可做得更好的地方                                                                                                                     |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [S1 smalltownboyai.com](https://smalltownboyai.com/)                             | 双图、人物组合、提示词、照片要求、付费与音乐 FAQ                             | 本次搜索摘要与后续正文的时长／价格存在版本差异，不能用旧摘要判定当前规格。最新正文固定 480p，结尾仍宣传 HD；输出描述应与按钮和订单一致。 |
| [S2 Flowlio](https://flowlioai.com/smalltown-boy-dance-ai)                       | 视觉描述式问法、角色顺序、单图、猫狗、CapCut、费用、水印、音轨；FAQ 已很全面 | 不能宣称“竞品都没写这些”。我们应补充产品自己的最低购买金额、到期时间、任务待确认与失败的区别，并用实际样例证明角色稳定性。               |
| [S3 MakeViral](https://www.makeviral.ai/templates/smalltown-boy-ai-dance)        | 宠物／人类、分镜、提示词、14 秒截取范围、价格与常见异常                      | 它已回答许多长尾；进一步机会是展示本站相同输入的真实结果、明确是否可免费重试，而不让“再生成一次”掩盖额外成本。                           |
| [S4 Smalltownboydance.org](https://smalltownboydance.org/)                       | 两角色顺序、完整版本、无音轨说明、直接美元价格、失败积分返还、文件保留       | 简明程度值得借鉴。我们需要把已实现的账户找回与 24 小时访问规则放在付款前；不照搬其无账号和 30 天保留承诺。                               |
| [S5 Media.io](https://www.media.io/ai/explore/zone/smalltown-boy-ai-dance-trend) | 参考视频与提示词路线、身份一致性检查                                         | 面向想调模型的用户较合适；本站可提供已验证的固定模板路线，让用户在看样例后知道不需要准备参考视频。                                       |

**差异化不是再多写 30 个问句，而是补足以下四种决策信息：**

1. **我找到的是哪一种舞？** 区分父母怀旧舞、真人双人尖叫舞、AI 双猫版本；先给可播放样例，再解释。无需声称谁是唯一首创。
2. **最低实际要付多少？** 积分单次消耗、最低可覆盖套餐、余额、重试是否收费一起说明。不要只展示大套餐均摊价。
3. **成片具体是什么？** 几秒、几个角色、什么比例、包含哪段动作、音轨与水印状态在一个规格卡中回答。
4. **效果或任务不对怎么办？** 区分技术失败、仍在处理中、成功但不满意，明确积分处理；展示真实样例，不用“100% identical”。

这些是样本页面中可改善的信息组织与信任机会，不是已证明的无人竞争关键词。

## 4. 用户在 AI 中可能怎样问

以下都是**拟真问法设计**，不是 ChatGPT 热门问题排名。A/B/C 对应上面的搜索证据；问题的完整措辞仍是我们拟写的。

| 意图     | 可能的完整问法                                                                  | 对应 FAQ | 证据基础                 |
| -------- | ------------------------------------------------------------------------------- | -------- | ------------------------ |
| 识别     | “I keep seeing two cats screaming and then dancing. What is that trend called?” | 1        | A 宽泛双猫词＋B 趋势页面 |
| 找歌     | “What is the song in the Smalltown Boy cat dance meme?”                         | 2        | A song 联想＋B           |
| 做同款   | “How can I make the Smalltown Boy AI video with photos of me and my friend?”    | 3/5      | B                        |
| 免提示词 | “Is there a Smalltown Boy generator where I don't have to write a prompt?”      | 4        | B                        |
| 输入限制 | “Do we need a photo together, or can I use two separate selfies?”               | 5        | C，任务推导              |
| 单图     | “Can I do both parts with just one photo?”                                      | 6        | B                        |
| 宠物     | “Can I use my own two cats, or a cat and a dog?”                                | 7        | B                        |
| 模板辨别 | “Is the Smalltown Boy CapCut template the same as the AI cat dance?”            | 8        | B，S6 证明有同名旧模板   |
| 免费     | “Can I make this for free, or do I need to buy credits first?”                  | 9        | B                        |
| 成本     | “What's the minimum I need to pay for one video, not a monthly plan?”           | 10       | C，支付决策              |
| 时长     | “Why are some Smalltown Boy videos 14 seconds and others 21 seconds?”           | 11       | C，公开规格差异          |
| 音轨     | “Does it include the Smalltown Boy song, or do I add the audio myself?”         | 12       | B                        |
| 下载     | “Can I download the video without a watermark?”                                 | 13       | B                        |
| 效果     | “Why does my face change halfway through the dance?”                            | 14       | C                        |
| 失败     | “My video is stuck. Should I generate it again, and will I be charged twice?”   | 15       | C                        |
| 隐私     | “How long do you keep my photos, and can I delete them?”                        | 16       | B，公开竞品政策问题      |

不要围绕“ChatGPT 推荐哪个最好”写自封排名。用适用条件、真实示例和可验证规格，让回答系统能够客观描述本站。

## 5. 首页完整文案设计

### 5.1 上线后的 SEO 元数据（须先通过双人模板验收）

**Title（英文）**：Smalltown Boy AI Dance Video Generator | SmalltownBoyAI

**Description（英文）**：Make a Smalltown Boy AI dance video from your photos. See the template, choose your duo, and check the video format and credit cost before you generate.

**Title（中文）**：Smalltown Boy AI 视频生成器｜照片制作双人跳舞视频

**Description（中文）**：用照片制作 Smalltown Boy AI 双人舞视频。先看模板与角色顺序，再确认视频规格和积分费用，制作属于你的同款。

### 5.2 首屏

**H1 EN**：Smalltown Boy AI Dance Video Generator

**副标题 EN**：Your faces. That scream. The dance everyone recognizes.

**说明 EN**：Turn two photos into your own Smalltown Boy dance video. Watch the template first, choose who takes each role, and check the cost before you generate.

**主 CTA EN**：Create my dance video

**次 CTA EN**：Watch the template

**H1 中文**：用照片制作 Smalltown Boy AI 双人舞视频

**副标题 中文**：把你们放进那段尖叫、对视、一起跳舞的名场面。

**说明 中文**：上传两张照片，制作你的 Smalltown Boy 舞蹈视频。先看模板、选好角色，再确认费用后生成。

**CTA 中文**：制作我的舞蹈视频 / 先看模板

验收条件：双图角色映射和同款舞蹈必须真实工作。不加“免费生成”“几秒完成”“官方”“一定爆火”。若只支持真人，首屏不承诺宠物。

### 5.3 生成区

**H2 EN**：Choose your Smalltown Boy dance duo

**说明 EN**：Add one clear photo for each role. Use the preview to check who appears first.

**角色文案 EN**：Photo 1 · Opening close-up / Photo 2 · Dance partner

**照片提示 EN**：One subject per photo. Keep the face clear, use even lighting, and avoid heavy filters or hands covering the face.

**中文**：选好你的双人舞搭档。每个角色上传一张清晰照片，通过预览确认出场顺序。照片 1：开场特写；照片 2：舞蹈搭档。避免多人合照、重度滤镜和面部遮挡。

规格卡放在生成按钮上方，使用实际产品数据：`时长｜画面比例｜分辨率｜音轨状态｜本次积分｜需要补购金额`。复查配置为 14 秒、9:16、默认 720p。音轨与效果仍须验收，不要把待定值原样上线。角色标题最终须对照实际参考视频，不能假设每个截取版都会交换两次特写。

### 5.4 趋势解释区

**H2 EN**：What is the Smalltown Boy AI dance trend?

**正文 EN**：The Smalltown Boy AI dance trend turns a dramatic duo performance into a personalized video: a close-up reaction, a partner dancing behind, and a dance together. Cat versions use the same visual joke with animated pets. The name comes from Bronski Beat’s “Smalltown Boy.” Check the preview to find the version you want to recreate.

**中文**：Smalltown Boy AI 舞蹈热点把夸张的双人表演变成个性化视频：一个角色贴近镜头做出戏剧化表情，另一个在后面跳舞，随后一起入镜。双猫版本把主角换成了动画化的宠物。名称来自 Bronski Beat 的《Smalltown Boy》。先看预览，确认是不是你想制作的那一版。

这里配原始参考与本站实际输出的明确标签。若展示他人视频，标明来源；不能把它叫“本站生成效果”。关于起源只写核实过的来源，不复制竞争站的首创日期或播放数字。

### 5.5 三步教程

**H2 EN**：How to make a Smalltown Boy AI video from photos

1. **Choose the two photos.** Add one photo per role and check the order against the template preview.
2. **Review and generate.** Sign in, choose an available resolution, and review the credit cost before starting.
3. **Save your video.** Follow progress in My videos and download the finished MP4 before the displayed expiry time.

**中文**：① 上传两张角色照片，对照模板确认顺序。② 登录、选择可用分辨率，确认积分费用后开始。③ 在“我的视频”查看进度，并在页面显示的截止时间前下载 MP4。

### 5.6 效果与输入说明

**H2 EN**：See the photos behind the result

**说明 EN**：Compare the input photos with the finished video. Check the close-ups, the dance, and the final frames to see how each person’s appearance carries through.

**中文**：看看照片如何变成视频。把输入照片与真实成片放在一起，检查特写、舞蹈和结尾，了解人物外观在不同镜头中的表现。

实施要求：展示至少一个完整、未剪掉瑕疵的真人双人样例；只有宠物验收成功后再加宠物样例。图注写真实时长、分辨率、生成日期；耗时有记录才写。没有证据时，不添加用户数、五星评分和浏览量。

### 5.7 价格区

**H2 EN**：Know the cost before you create

**说明 EN**：Choose a one-time credit pack. Check the credits needed for your selected resolution and the smallest pack that covers your video. No recurring subscription.

**中文**：生成前，先看清费用。一次购买积分，按所选分辨率扣除。页面同时显示本次所需积分和可覆盖本次生成的最低套餐，不自动续订。

当前代码价格可供内部参考：$9.90 买 100 积分可覆盖一条 480p 请求；720p/1080p 分别需要 150/250 积分，零余额用户当前最低须买 $32.90 的 400 积分套餐。高分辨率不能无条件标“from $9.90”。新模板成本复核后，以统一配置动态生成文案。

### 5.8 页尾 CTA

**EN**：Ready to put your duo in the dance? Watch the template, choose your photos, and make your version.

**中文**：轮到你们上场了。先看模板，选好照片，制作你们的版本。

按钮：Create my Smalltown Boy video / 制作我的 Smalltown Boy 视频。

## 6. FAQ 英中稿

首页建议优先展示 1、3、4、5、7、8、9、10、12、14、15、16；其余可放在相关说明区或后续教程。这里提供完整候选库，避免首页塞满重复问句。

`知识稿`：描述趋势／方法，核对配套样例后可用。`条件稿`：只有括号中条件成立才发布。`规则稿`：依据现有代码，仍须在新站上线验收时复核。编辑说明不展示给访客。

### 1. What is the video where two cats scream and then dance? / 两只猫尖叫后一起跳舞的视频叫什么？

**EN**：If you mean the clip with a dramatic close-up, a second cat dancing behind, and the pair dancing together, you are probably looking for the Smalltown Boy AI dance trend. Several versions exist, so compare the scene and movements with the preview before choosing a template.

**中文**：如果你说的是一只猫在镜头前做夸张表情、另一只在后面跳舞，随后一起入镜的视频，你找的很可能是 Smalltown Boy AI 舞蹈。这个热点有不同版本，选模板前先对照场景和动作。

状态：知识稿。不要把所有双猫跳舞视频都判断成这个热点。

### 2. What song is used in the Smalltown Boy dance meme? / 这个舞蹈用的是什么歌？

**EN**：The trend is associated with “Smalltown Boy” by Bronski Beat. The song name identifies the trend; it does not tell you whether a particular video generator includes that recording. Check the template’s audio information before generating.

**中文**：这个热点通常搭配 Bronski Beat 的《Smalltown Boy》。歌名能帮助你找到同款，但不代表每个生成器都会附带原版录音；生成前查看模板的音轨说明。

状态：知识稿。

### 3. How do I make a Smalltown Boy AI video with my own photos? / 怎么用自己的照片制作同款？

**EN**：Choose the Smalltown Boy template and upload one photo for each of its two roles. Sign in, review the available resolution and credit cost, then start generation. Follow the task in My videos and download the result before its displayed expiry time.

**中文**：选择 Smalltown Boy 模板，为两个角色分别上传照片。登录后确认可用分辨率与积分费用，再开始生成。在“我的视频”查看任务，并在显示的到期时间前下载结果。

状态：条件稿；双人模板与登录恢复流程验收后使用。

### 4. Do I need a prompt or a reference video? / 需要写提示词或上传参考视频吗？

**EN**：No prompt or reference upload is needed for this fixed template. Your photos define the cast; the template defines the performance. Watch the preview first, because a fixed template does not let you request a different routine or camera sequence.

**中文**：这个固定模板不需要你写提示词或上传参考视频。照片决定主角，模板决定表演。请先看预览：固定模板不能通过文字改成另一套舞蹈或镜头顺序。

状态：条件稿；固定 Smalltown Boy 参考接入后使用。

### 5. Do I need two separate photos or a photo of us together? / 要两张单人照，还是一张合照？

**EN**：Use two separate photos, with one person in each. You do not need to be photographed together. Match each photo to its role in the preview so the opening performer and the dance partner are assigned correctly.

**中文**：分别上传两张单人照片，不需要两个人一起拍照。对照预览安排照片顺序，确认谁是开场角色、谁是舞蹈搭档。

状态：条件稿；两张独立输入与角色映射验证后使用。

### 6. Can I make the Smalltown Boy video with only one photo? / 只有一张照片也能做吗？

**EN**：The duo template needs an image for each role. If you want to play both parts, using the same photo twice still requires a template that supports duplicate inputs. This option has not yet been verified for SmalltownBoyAI.

**中文**：双人模板的每个角色都需要图片。如果想一个人扮演两个角色，还需要模板支持重复使用同一张照片；SmalltownBoyAI 的这一用法目前尚未完成验证。

状态：当前真实答复。验收后可改为具体步骤，不照搬竞品“同图必定可用”的承诺。

### 7. Can I make it with my own cats or dogs? / 可以用自己的猫狗做同款吗？

**EN**：Cat and dog remixes are part of this trend, but each generator supports different subjects. SmalltownBoyAI’s pet version has not yet been verified. Do not purchase a human template expecting it to reproduce a pet dance.

**中文**：这个热点有猫狗改编版，但不同工具支持的主角不同。SmalltownBoyAI 的宠物版本目前尚未完成验证，不要把真人模板当成已验证的宠物模板购买。

状态：当前真实答复。宠物成功验证后替换为：“Yes—choose the pet template and add one clear photo per pet. Check the sample to see the supported performance before generating.” 中文：“可以，选择宠物模板，为每只宠物上传一张清晰照片。先查看实际样例，再开始生成。”

### 8. Is a Smalltown Boy CapCut template the same as this AI dance? / CapCut 同名模板就是这个 AI 舞蹈吗？

**EN**：Not necessarily. Templates can share the song name while producing different edits or performances. Check whether the preview shows the screaming duo, whether it asks for photos or filmed clips, and whether it generates new motion. Choose by the result and inputs, not the title alone.

**中文**：不一定。同名模板可能只是使用同一首歌，剪辑方式和动作并不相同。查看预览是否是尖叫双人舞、需要照片还是实拍片段、是否生成新的动作，不要只根据标题选择。

状态：知识稿。S6 是一个需 9 段素材的 2024 模板实例；不能据此断言所有 CapCut 模板都不支持 AI。

### 9. Can I make a Smalltown Boy AI video for free? / 可以免费生成吗？

**EN**：SmalltownBoyAI is not offering a verified free Smalltown Boy generation at this stage. A demonstration or sample preview is not a free personalized render. Check the generator and pricing page for the current credit requirement before starting.

**中文**：目前没有已验证开放的 Smalltown Boy 免费生成。演示视频或样例预览不等于免费生成你的个人视频；开始前请查看生成区和价格页的积分要求。

状态：当前真实答复。正式付费开放且规则确认后，改为明确的“No. Personalized generation uses credits…”；若真的提供免费额度，写出能否覆盖一条完整视频，而不是仅写“免费注册”。

### 10. How much does one video cost? Is there a subscription? / 一条视频多少钱？需要订阅吗？

**EN**：Generation uses credits from a one-time pack, with no recurring subscription. The credits required depend on the selected resolution. Check both the per-video credit cost and the smallest pack that covers it; the pack price is the amount you pay at checkout.

**中文**：通过一次性套餐购买积分，不自动续订。单次积分取决于所选分辨率。请同时查看本次所需积分与能够覆盖它的最低套餐；结账实际支付的是套餐金额。

状态：规则稿；正式页面在这段后动态插入真实金额和积分表，不把数字写死在多个翻译键中。

### 11. Why do some Smalltown Boy videos have different lengths? / 为什么有的版本长，有的版本短？

**EN**：Different templates may use different parts of the performance. A shorter edit can omit an opening reaction or a role swap. Compare the entire preview and the stated duration rather than assuming every generator includes the same sequence.

**中文**：不同模板可能选取了不同片段，短版可能省略开场反应或角色交换。请完整看完预览，并核对标注时长，不要默认所有生成器都会输出同一段内容。

状态：知识稿；本站复查输出配置是 14 秒，由本地模板配置展示并在真实成片验收后确认，不借用竞品参数。

### 12. Does the video include the original Smalltown Boy song? / 会附带原版歌曲吗？

**EN**：The original recording is not guaranteed. Check the template’s audio status before generating, then listen to the finished video before posting. If you need a different soundtrack, use audio available for your intended use in your editor or publishing platform.

**中文**：不保证附带原版录音。生成前请查看模板的音轨状态，发布前试听成片。如果需要替换配乐，请使用编辑器或发布平台中适用于你用途的音频。

状态：保守稿；当前 provider 请求音频不等于原曲获保证。上线时必须替换为明确的“无音轨／AI 音轨／已验证的音轨交付”事实，不长期只留下模糊表述。

### 13. Can I download the video without a watermark? / 下载后有水印吗？

**EN**：A watermark-free Smalltown Boy export has not yet been verified for SmalltownBoyAI. Check an actual downloaded sample and the listed export conditions before purchasing; the appearance of a preview alone does not establish the final file’s quality or watermark status.

**中文**：SmalltownBoyAI 的 Smalltown Boy 成片目前尚未完成无水印验证。购买前查看实际下载样例与导出条件，不能仅凭预览判断最终文件的画质和水印状态。

状态：当前真实答复；提示词要求“不添加水印”不足以支撑无水印承诺。验收后改为直接说明文件格式、是否所有档位适用。

### 14. Will my face stay exactly the same throughout the video? / 整段视频都会和我的脸完全一样吗？

**EN**：An exact match in every frame is not guaranteed. Use a sharp, unobstructed photo with even lighting, and inspect the close-ups and final frames. Facial features, hands and clothing can change during fast motion. Starting another generation may use additional credits.

**中文**：无法保证每一帧都完全一致。建议使用光线均匀、面部清晰无遮挡的照片，并检查特写和结尾。在快速运动中，面部、手部或衣服细节可能变化；重新生成可能再次消耗积分。

状态：规则稿。不要把提高分辨率写成解决身份漂移的保证。

### 15. My video is stuck or failed. Should I start again? / 视频卡住或失败了，要重新生成吗？

**EN**：Check the existing task in My videos first. A task that is still processing or being checked is not a confirmed failure. Credits are restored after a confirmed generation failure; if the task remains unfinished, use Get help before submitting another paid request.

**中文**：先在“我的视频”查看原任务。仍在生成或核查的任务不等于已经失败。确认生成失败后返还生成积分；如果一直未完成，先使用“获取帮助”，避免重复提交付费请求。

状态：规则稿；积分返还与现金退款分开。成功但不满意不能自动承诺退款或免费重做。

### 16. How long can I access my photos and video? / 照片和视频能保留多久？

**EN**：File access expires 24 hours after the order is created, not 24 hours after the video finishes. Download your result before the expiry time. You can remove your files from My videos earlier; the order record remains in your account.

**中文**：文件访问在订单创建后的 24 小时到期，不是视频生成完成后的 24 小时。请在截止时间前下载；也可以提前在“我的视频”删除文件。账户中的订单记录仍会保留。

状态：规则稿；不要扩大成“所有第三方副本同时永久删除”或“绝不用于训练”，这些需要额外证据。

## 7. SEO / GEO 落地安排

### 先做一个完整首页，不批量铺薄页面

| 页面                                         | 目标与内容                                           | 发布条件                                   |
| -------------------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| `/`                                          | 核心生成器、真实样例、三步、价格概览、主 FAQ         | Smalltown Boy 模板与购买生成链路验收       |
| `/pricing`                                   | 本次积分、最低购买金额、续订、失败与退款区分         | 定价确认；与实际结账同步                   |
| `/guides/how-to-make-smalltown-boy-ai-video` | 独立价值：真实步骤截图、输入样例、成片检查和问题处理 | 有自己的实际操作记录                       |
| `/guides/smalltown-boy-capcut-template`      | 如何辨认模板与选择制作路线                           | 补查具体可用模板，不能凭一例泛化           |
| `/smalltown-boy-cats`                        | 宠物专项样例、输入要求、已知缺陷                     | 宠物独立验收且有足够内容，否则留在首页 FAQ |

中文使用 `/zh` 对应版本；其他语言先不扩展。上述新路由是建议，尚未创建。不要为了 `AI / generator / maker / online` 等同义词各建重复页。

### 可引用的答案结构

每个问答首句直接回答，后面给操作、限制或证据；让答案离开页面上下文仍能读懂。以“模板定义、输入要求、输出规格、价格规则、失败处理”为独立小段，避免所有回答都变成营销 CTA。

FAQ、首页、价格页、`SoftwareApplication` 数据和机器可读文本必须一致。已有 `danceFaq` 共用来源应继续保持。`llms.txt` 可维护，但不把它当成获推荐的通行证。

技术验收应检查服务端 HTML 中有正文与 FAQ；canonical 和 hreflang 指向实际站点；站点公开后确认 robots、CDN 与索引配置。`VITE_SITE_INDEXABLE=false` 应在内容和真实流程验收后才调整。没有真实视频元数据时不堆 VideoObject；没有真实评价时不加评分。

Google 的最新官方变更记录已写明 FAQ 富结果停止展示，因此这里做 FAQ 是为了回答需求和保持语义清楚，**不是承诺搜索结果出现 FAQ 展开卡片**。Google 对生成式搜索也没有要求特殊 AI schema；不能保证排名、收录或 AI 引用。[S8](https://developers.google.com/search/updates) [S9](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)

### 上线后如何判断是否有效

1. 保存发布日期和改版范围。GSC 按 query、page、country、device 看 7 天与 28 天窗口，分开核心生成词、舞蹈词、猫词与纯音乐词；低样本不宣布胜负。
2. 记录自然搜索／可识别 AI 来源进入 → 看样例 → 上传成功 → 开始生成 → 结账 → 支付确认 → 成片交付。跳转到 Stripe 不等于成交；访问增长不等于文案导致转化提升。
3. 用本文件的 16 条问法建立可复测题库，在 ChatGPT、Gemini、Perplexity 等产品分别记录日期、模式、地区、原始回答、自然提及与链接引用。不要在问题里先塞入本站名字；品牌认知测试另算。
4. 把“被提到”“链接引用”“真实引荐访问”“付款”分开。AI 可能不给 referrer，所以可归因访问不是全部 AI 流量。
5. 根据真实搜索曝光和客服疑问补长尾；如果大量流量寻找免费工具而付费意向低，优先明确价格，不能用假免费标题强拉流量。

## 8. 来源与限制

- S1：[Smalltownboyai.com](https://smalltownboyai.com/)——竞争站文案；本次摘要与正文有版本差异，规格以最近正文快照理解，未测产品。
- S2：[Flowlio](https://flowlioai.com/smalltown-boy-dance-ai)——竞争站意图覆盖与规格文案，未测产品。
- S3：[MakeViral](https://www.makeviral.ai/templates/smalltown-boy-ai-dance)——竞争站宠物／人类模板、教学和问题处理，未测产品。
- S4：[Smalltownboydance.org](https://smalltownboydance.org/)——竞争站角色、费用与音轨说明，未测产品。
- S5：[Media.io](https://www.media.io/ai/explore/zone/smalltown-boy-ai-dance-trend)——参考视频与提示词教程，未测效果。
- S6：[CapCut 同名模板](https://www.capcut.com/template-detail/smalltown-boy/7407176005636361478)——页面日期 2024-08-25、9 段素材、3:4；证明同名模板不一定对应当前 AI 双猫版本。
- S7：[Tikwm 上的 CapCut 教程镜像](https://tikwm.com/video/7693491048487652621.html)——2026-10-06 的教程标题；只是第三方镜像内容证据，不等于 CapCut 官方功能验证或真实搜索日志。
- S8：[Google Search 文档变更记录](https://developers.google.com/search/updates)——2026 年 FAQ 富结果退役更新。
- S9：[Google 生成式搜索优化指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)——内容、抓取与结构化数据的实际作用边界。

未确认：该热点的绝对搜索量、Google Trends 曲线与阶段、各国需求排名、竞争产品实际成功率、ChatGPT 用户提问频次，以及本站上线后的任何 SEO/GEO 成效。没有把竞争页面数量、社交互动量或模板标题当作这些数据。
