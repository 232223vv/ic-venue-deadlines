# 会议与期刊专刊截止日期追踪页 — 设计文档

- 日期:2026-10-28
- 状态:待用户确认
- 形态:零构建静态单页(本地双击可用,亦可静态托管)

## 1. 目标

面向集成电路 / 芯片设计 / 体系结构 / EDA 方向,用一页回答三个问题:**什么时候截止、征什么主题、在哪开。**

**v1 明确不做**:自动爬虫、定时任务、后端服务、登录、推送提醒、暗色模式、多语言。数据更新由维护者改文件完成。

## 2. 收录范围

**会议 15 个**

| 组 | 会场 |
|---|---|
| EDA | DAC、ICCAD、DATE、ASP-DAC、ICCD |
| 电路 / 器件 | ISSCC、CICC、A-SSCC、ESSERC、VLSI Symp、ISCAS |
| 体系结构 | ISCA、MICRO、HPCA、ASPLOS |

ESSERC 条目携带别名 `ESSCIRC / ESSDERC / ESSCC`,搜索任一写法均可命中。

**期刊 9 个**:IEEE TCAD、IEEE TVLSI、IEEE TCAS-I、IEEE TCAS-II、ACM TODAES、ACM TECS、IEEE Design & Test、IEEE JETCAS、IEEE OJCAS。

期刊常规投稿为滚动制,页面只标注"滚动投稿";参与截止日期排序的是**开放中的专刊(Special Issue)**。

## 3. 数据模型

数据以 `window.DATA` 形式写在 `data.js` 中。

### 3.1 会议

```
{
  id: "dac-2027",
  name: "Design Automation Conference",
  abbr: "DAC",
  aliases: [],
  group: "eda" | "circuits" | "arch",
  society: "ACM SIGDA / IEEE CEDA",
  ccf: "A" | "B" | "C" | null,        // null 表示不在 CCF 目录
  edition: 2027,
  startDate: "2027-06-21",
  endDate: "2027-06-25",
  place: "San Francisco, CA, USA",
  deadlines: [
    { label: "摘要", date: "2026-11-17", tz: "AoE", note: "" }
  ],
  topics: ["设计方法学", "低功耗", "..."],
  url: "https://dac.com",
  source: "https://dac.com/...",       // 取数页
  checked: "2026-10-28",
  status: "confirmed" | "tbd"          // tbd = 会期或截止日期尚未公布
}
```

### 3.2 期刊

```
{
  id: "tcad",
  name: "IEEE Transactions on Computer-Aided Design of Integrated Circuits and Systems",
  abbr: "IEEE TCAD",
  publisher: "IEEE",
  ccf: "A" | "B" | "C" | null,
  rolling: true,
  url: "...",
  specialIssues: [
    { title: "...", topics: ["..."], deadline: "2026-12-15", tz: "AoE",
      link: "...", source: "...", checked: "2026-10-28" }
  ]
}
```

### 3.3 约定

- 日期一律 ISO 8601(`YYYY-MM-DD`),时区单独存 `tz`(`AoE` / `UTC-8` / `UTC+8` 等),界面注明"以会场公布时区为准"。
- **查不到的日期写 `status: "tbd"`,不允许推测填充。**
- 每条记录必须带 `source` 与 `checked`,界面展示核对日期。

## 4. 数据来源与更新

| 数据 | 来源 | 更新方式 | 频率 |
|---|---|---|---|
| DAC、ICCAD、DATE、ASP-DAC、ICCD、ISCAS、ISCA、MICRO、HPCA、ASPLOS | ccfddl 社区 YAML + 官网核对 | 半自动 | 季度 |
| ISSCC、CICC、A-SSCC、ESSERC、VLSI Symp | 各会官网 CFP | 人工 | 季度 |
| 9 个期刊的开放专刊 | IEEE Xplore / ACM DL / 出版社 CFP 页 | 人工 | 季度 |

原则:**官网优先,ccfddl 仅作交叉提醒**;两者冲突时以官网为准并在 `note` 中记录差异。

## 5. 页面结构与交互

- **吸顶导航**:站名 + 数据核对日期,半透明毛玻璃背景。
- **Hero**:大标题 + 一行副标题 + 统计行(如"最近 30 天 3 个截止")。
- **主分段控件**:`会议` | `期刊专刊`。
- **筛选行**:搜索框 + 分段控件(方向 / CCF 等级 / 时间窗 30·90·180 天·全部)。
- **列表**:按方向分组的 inset 分组列表,组头为小号灰字;行内左为名称与元信息、右为大号倒计时天数。
- **行展开**:行内联展开,显示举办日期、征稿主题 chips、全部 deadline(含时区与备注)、官网与来源链接、核对日期;地点留在折叠行内。
- **排序**:默认"最近截止优先";已过期折叠到"已结束"分组;`tbd` 条目排在末尾并带灰色"待公布"徽章。
- **期刊专刊视图**:按截止日期升序;未有开放专刊的期刊折叠显示"暂无开放专刊"。

**边界状态**:无结果时显示说明性空状态,不显示空白页。

## 6. 视觉规范(Apple 风格)

**原则**:内容优先;层级靠字号与字重,不靠边框和色块;大留白、发丝线、柔和阴影;动效只服务于状态变化。

**字体**

- 字族:`-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`
- 标题:600 字重,负字距 `-0.02em`
- 正文:17px / 1.47;脚注:12px
- 倒计时数字使用 `font-variant-numeric: tabular-nums`

**颜色**

| 用途 | 值 |
|---|---|
| 主背景 / 次级背景 | `#ffffff` / `#f5f5f7` |
| 主文字 / 次要 / 三级 | `#1d1d1f` / `#6e6e73` / `#737376` |
| 强调色(链接、按钮) | `#0071e3`,悬停 `#0077ed` |
| 发丝线 | `rgba(0,0,0,0.10)` |
| 紧急(≤7 天)/ 临近(≤30 天) | `#ff3b30` / `#c25e00` |
| CCF A / B / C / 目录外 | `#0058b3` / `#5856d6` / `#0b6b7d` / `#515154` |

**形状与动效**

- 圆角:分组容器 20px,徽章与分段控件 980px(药丸)
- 阴影:静止 `0 2px 8px rgba(0,0,0,0.04)`;悬停仅加 1px 上浮
- 过渡:`240ms cubic-bezier(0.4,0,0.2,1)`;`prefers-reduced-motion` 时全部关闭

**可访问性**

- 焦点环 `3px rgba(0,113,227,0.4)`,键盘可完成筛选、展开、切换
- 正文对比度 ≥ 4.5:1;ICON 仅用 SVG 内联,不引外部字体与 CDN

**响应式**

- 桌面居中 860px 单列;≤640px 边距 20px,元信息换行,倒计时移至标题右侧
- 375px 宽度下不得出现横向滚动

## 7. 技术方案

`index.html` + `style.css` + `data.js`,无框架、无依赖、无 CDN、无构建步骤。

- 数据用 `window.DATA` 而非 `fetch('data.json')`,避免 `file://` 下的 CORS 限制。
- 渲染与筛选为原生 JS,列表规模约 24 条,无需虚拟滚动。

## 8. 验收标准

1. 双击 `index.html`(`file://`)可正常渲染,控制台无报错。
2. 3 组筛选 + 搜索 + 排序任意组合结果正确;倒计时边界(今天、明天、已过期)表现正确。
3. 375px 宽度无横向滚动;分段控件与展开行在触屏可用。
4. 键盘可完成全部交互,焦点可见。
5. 数据完整性:日期格式统一、时区字段非空、每条含 `source` 与 `checked`、无占位假数据。
6. 所有 `source` 链接可访问。

## 9. 风险

- 部分 2027 会期与专刊尚未发布,首版会存在 `tbd` 条目 — 这是真实状态,不是缺陷。
- ccfddl 由社区维护,可能滞后;官网优先策略已在第 4 节固化。
- IEEE Xplore / ACM DL 专刊页结构变动会导致人工核对变慢,但不影响页面本身。
