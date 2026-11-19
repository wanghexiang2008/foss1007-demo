# Social Network Spread & Efficiency

A browser-native visual lab for social network analysis.  
[English](#english) · [中文](#chinese)

<a id="english"></a>
## English

A three-page, no-build visualization site:

1. **Spread** — change α and watch how far a post travels through one network.
2. **Efficiency** — give every edge a delay in hours, change β, and inspect the average response time of the latest β activities.
3. **Sandbox** — draw your own network, connect nodes, edit delays, and watch both metrics update live.

There is no landing page. The site opens directly on **Spread**; the top navigation switches between the three studies.

All networks are **diffusion trees**: every activity has exactly one source, so cycles are not allowed. Preset graphs keep their shortest-path tree, which preserves the original hop counts and arrival times while removing every cycle.

---

### Metrics

#### Spread: S(α)

```text
S(α) = number of activities whose hop distance from the seed is ≤ α
```

- **Hop distance** is the minimum number of unweighted edges between a node and the seed.
- Only non-seed nodes are counted. The seed is the original post and does not count toward its own spread.
- Hop distances are computed with BFS.
- Unreachable nodes are ignored.
- α currently ranges from `1.0` to `8.0` in steps of `0.5`.

#### Efficiency: E(β)

```text
E(β) = ( Σ repost time · w_repost + Σ comment time · w_comment ) / β
```

- Each non-seed node has an **arrival time**: the shortest weighted path from the seed, with edge weights measured in hours (Dijkstra).
- **The β window grows outward from the seed.** All reachable activities are sorted by arrival time from earliest to latest, and the first β activities are selected — the β activities that happen first after the initial post.
- The timeline shade starts at the seed/t = 0 on the left and ends at the β-th activity.
- The site uses fixed weights: `w_repost = 1.0` and `w_comment = 1.5`.
- If β is larger than the number of reachable activities, β is capped automatically.
- A lower E(β) means a faster response.

> Terminology note: the site follows the original “latest activities” wording, but the β window is counted outward from the seed. It means the first β activities after publication, not the slowest tail at the end of the cascade.

---

### What each page does

#### 1. Spread

- Network shown: **Dense community**.
- Controls: α (spread radius) and β (activity window).
- Live output: S(α), E(β), plus the network's node/activity count.
- Highlighting:
  - Nodes inside α have an accent-colored ring.
  - Nodes inside the β window have a gold dashed ring.
- Two charts:
  - **Spread vs α** — S(α) as a step curve.
  - **Efficiency vs β** — E(β) for this network.
- Moving either slider updates the graph, numbers, and charts immediately.

#### 2. Efficiency

- Network shown: **Delayed cascade**.
- Every edge has a delay in hours. Thicker, warmer edges are slower.
- Controls: β (activity window) and α (spread radius).
- Live output: E(β) and S(α).
- The **Activity timeline** below the graph:
  - The x-axis is arrival time from the seed.
  - Circles are reposts; diamonds are comments.
  - Gold activities are inside the current β window.
  - The shaded band starts at t = 0 because the β window starts at the seed.
- Two charts:
  - **Spread vs α** — S(α) for this network.
  - **Efficiency vs β** — E(β) for this network.
- Hover a node or edge for distance, arrival time, and exact delay.

#### 3. Sandbox

- An editable network. The default is a 13-node sample.
- Live S(α) and E(β), plus both hyperparameter charts.
- Tools:
  - **Move** — drag nodes; click a node or edge to select it.
  - **Node** — click the canvas to add an activity. The first node on an empty canvas becomes the seed.
  - **Edge** — click one node, then another, to add an edge. New edges default to 1.0 h. An edge that would close a cycle is refused, because every activity has a single source.
  - **Erase** — click a node or edge to delete it.
- Inspector on the right:
  - Node: rename it, switch repost/comment, make it the seed, or delete it.
  - Edge: set its delay with the slider (0.2–10 h) or delete it.
  - With a selection, press `Delete` / `Backspace` to remove it; press `Esc` to cancel the current link source.
- Use the **Example** menu to load a sample network.
- **Reset** restores the sample and defaults; **Clear** empties the canvas.
- The maximum β updates automatically as the number of reachable activities changes.

---

### Legend

#### Network graph

| Mark | Meaning |
| --- | --- |
| Orange/red star / large node | **Seed**: original post at t = 0; excluded from S(α) and E(β) |
| Circle | **Repost** |
| Diamond | **Comment** |
| Accent-colored ring around a node | Node is inside the current **α radius** (distance ≤ α) |
| Gold dashed ring around a node | Node belongs to the current **β window** (first β activities from the seed) |
| Thicker / warmer edge | Larger delay; edges are also labeled in hours |
| `1.2h` near an edge | That edge's delay. Labels that would overlap are hidden; hover an edge to see its exact time |

#### Timeline

| Element | Meaning |
| --- | --- |
| Circle above the axis | Repost |
| Diamond below the axis | Comment |
| Gold activity | Inside the current β window |
| Shaded band on the left | The β window, counted outward from the seed |
| X-axis ticks | Arrival time in hours |

#### Charts

| Element | Meaning |
| --- | --- |
| **Spread vs α** | x-axis α, y-axis S(α); shows how the radius changes reach |
| **Efficiency vs β** | x-axis β, y-axis E(β); shows how the window changes average arrival time |
| Vertical dashed line | Current α or β |
| Dot on the line | Live value at the current parameter |
| Filled area below the line | Visual aid only; the line carries the value |

All charts are computed from the current graph and update when α, β, or the sandbox graph changes.

---

### Interactions and data

- No cookies, no localStorage, and no sessionStorage.
- Everything runs in the browser. A refresh restores the default examples.
- All charts and networks are rendered with native SVG; there are no third-party JavaScript dependencies.
- Spread values are integers; efficiency values use two decimal places.
- Edge weights affect efficiency arrival times, not unweighted spread.
- Unreachable nodes are excluded from both S and E; the sandbox displays the unreachable count.

---

### File structure

```text
index.html              HTML structure and page copy
assets/css/styles.css   Full-site styles (network, timeline, charts, sandbox)
assets/js/core.js       Graph data, analytics, S/E computation
assets/js/views.js      SVG network graph, line charts, timeline renderer
assets/js/app.js        Routing, controls, sandbox editing
favicon.svg             Site icon
README.md               This file
```

---

### Notes

- Spread uses `distance ≤ α` in the current version.
- Networks are acyclic diffusion trees; the Sandbox refuses edges that would create a cycle.
- The efficiency β window expands from the seed on the left, rather than taking the slowest activities at the end of the cascade.
- Activity weights are fixed at repost 1.0 / comment 1.5; they are not UI controls.

---

<a id="chinese"></a>
## 中文

一个纯前端的社交网络分析可视化网站。网站包含三个页面：

1. **Spread**：调节 α，观察一个网络中的信息传播范围。
2. **Efficiency**：给边设置时间权重，调节 β，观察最新活动的平均响应时间。
3. **Sandbox**：自己画网络、加边、改延迟，实时查看 spread 与 efficiency。

网站没有总览页，打开后会直接进入 **Spread**。顶部导航栏可以在三个页面之间切换。

所有网络都是**扩散树**：每个活动只有一个来源，因此不允许出现环。预设网络保留从 seed 出发的最短路径树，在删除所有环的同时，保持原来的 hop distance 和 arrival time 不变。

---

### 指标定义

#### Spread：S(α)

```text
S(α) = 满足 hop distance ≤ α 的活动数量
```

- **hop distance** 是节点到 seed（初始帖子）经过的最少边数，不考虑边的权重。
- 只统计非 seed 节点；seed 是原始帖子，不计入自己的 spread。
- 图上的 hop distance 使用 BFS 计算。
- 节点必须能从 seed 到达；不可达节点不计入。
- 当前网站中 α 的范围是 `1.0–8.0`，步长 `0.5`。

#### Efficiency：E(β)

```text
E(β) = ( Σ repost time · w_repost + Σ comment time · w_comment ) / β
```

- 每个非 seed 节点的 **arrival time** 是从 seed 到该节点的最短加权路径时间，边权重单位是小时（Dijkstra）。
- **β window 从 seed 开始算起**：把所有可达活动按 arrival time 从小到大排序，取最靠前的 β 个活动。也就是最接近初始帖、最早发生的 β 个活动。
- 时间轴上的阴影窗口也从左侧 seed（t = 0）开始，到第 β 个活动为止。
- 当前网站固定使用 `w_repost = 1.0`、`w_comment = 1.5`。
- 如果 β 大于可达活动数，β 会自动限制为可达活动数。
- 数值越低表示响应越快。

> 术语说明：网站沿用了 “latest activities” 的说法，但这里的 β 窗口是从 seed 向外计算的，也就是 seed 发布之后最先发生的 β 个活动；不是整个传播过程末尾最慢的那一批活动。

---

### 三个页面分别做什么

#### 1. Spread

- 展示网络：**Dense community**。
- 可调参数：α（传播半径）、β（activity window）。
- 实时输出：S(α)、E(β)，以及当前网络的节点数/活动数。
- 图上高亮：
  - 位于 α 半径内的节点会带 page accent 色的环形描边。
  - 处于 β window 内的节点会带金色虚线环。
- 两张图：
  - **Spread vs α**：S(α) 随 α 变化，是阶梯曲线。
  - **Efficiency vs β**：该网络的 E(β) 随 β 变化。
- 滑块变化会即时更新网络高亮、S/E 数值和两张图。

#### 2. Efficiency

- 展示网络：**Delayed cascade**。
- 每个节点之间的边有以小时为单位的 delay；边越粗/越偏暖色表示越慢。
- 可调参数：β（activity window）、α（传播半径）。
- 实时输出：E(β)、S(α)。
- 图下方的 **Activity timeline**：
  - 横轴是从 seed 开始经过的时间。
  - 圆点 = repost，菱形 = comment。
  - 金色活动 = 当前 β 窗口内的最新 β 个活动。
  - 左侧阴影从 t = 0 开始，表示 β window 从 seed 开始。
- 两张图：
  - **Spread vs α**：该网络的 S(α)。
  - **Efficiency vs β**：该网络的 E(β)。
- 图的节点和边可以悬停查看具体的距离、到达时间、延迟。

#### 3. Sandbox

- 一个可编辑的网络。默认加载一个 13 节点的示例网络。
- 实时输出 S(α) 和 E(β)，并提供两张 hyperparameter 曲线。
- 工具：
  - **Move**：拖动节点位置；点击节点或边选中。
  - **Node**：点击画布放置一个活动节点。空画布上的第一个节点会自动成为 seed。
  - **Edge**：先点一个节点，再点另一个节点，创建一条边。默认 delay 为 1.0 h。如果这条边会形成环，网站会拒绝创建，因为每个活动只能有一个来源。
  - **Erase**：点击节点或边删除。
- Inspector（右侧）：
  - 节点：修改名称、切换 repost / comment、设为 seed、删除节点。
  - 边：使用滑块设置 delay（0.2–10 h），或删除边。
  - 选中节点或边后按 `Delete` / `Backspace` 也可以删除；`Esc` 取消当前的连线选择。
- 顶部 Example 菜单可以载入不同的示例图。
- Reset 会重置示例图和参数；Clear 会清空画布。
- beta 的最大值会随可达活动数自动更新。

---

### 图例说明

#### 网络图

| 图形 | 含义 |
| --- | --- |
| 橙红色星形 / 大节点 | **seed**，初始帖子，t = 0，不计入 S(α) 和 E(β) |
| 圆点 | **repost** |
| 菱形 | **comment** |
| 节点外圈彩色环 | 节点在当前的 **α 范围内**（distance ≤ α） |
| 节点外圈金色虚线环 | 节点属于当前的 **β window**（从 seed 开始的最新 β 个活动） |
| 变粗/变色的边 | 边的 delay 越大，线越粗、越偏暖色 |
| 边上的 `1.2h` 标签 | 这条边的 delay；只显示不重叠的标签，悬停边可以看完整时间 |

#### Timeline

| 元素 | 含义 |
| --- | --- |
| 上方圆形点 | repost |
| 下方菱形点 | comment |
| 金色点 | 当前 β window 中的活动 |
| 左侧阴影 | 从 seed 开始计算的 β 窗口 |
| 横轴刻度 | 以小时计的 arrival time |

#### 图表

| 元素 | 含义 |
| --- | --- |
| **Spread vs α** | 横轴 α，纵轴 S(α)，显示半径变化对传播范围的影响 |
| **Efficiency vs β** | 横轴 β，纵轴 E(β)，显示窗口变化对平均到达时间的影响 |
| 竖向虚线 | 当前 α 或 β 的位置 |
| 曲线上的圆点 | 当前参数下的实时数值 |
| 曲线下方浅色区域 | 曲线覆盖区域，仅作为视觉辅助 |

所有图表都由当前网络实时计算，改变 α、β，或者在 Sandbox 中修改图，图表会同步更新。

---

### 交互与数据说明

- 全站不使用 cookie，也没有 localStorage/sessionStorage。
- 所有计算都在浏览器内完成，刷新页面后会回到默认示例。
- 图表和网络渲染全部使用原生 SVG，JavaScript 无第三方依赖。
- 数值使用两点小数（efficiency）或整数（spread）显示。
- 边权重只影响 efficiency 的到达时间，不影响 unweighted spread。
- 如果图中存在不可达节点，它们会被排除在 S 和 E 之外，Sandbox 会显示 unreachable 数量。

---

### 文件结构

```text
index.html             三个页面的 HTML 结构和文案
assets/css/styles.css  全站样式（网络图、timeline、图表、Sandbox）
assets/js/core.js      网络数据、图分析、S/E 计算
assets/js/views.js     SVG 网络图、line chart、timeline 渲染
assets/js/app.js       路由、控件事件、Sandbox 编辑逻辑
favicon.svg            站点图标
README.md              本文件
```

---

### 备注

- Spread 使用 `distance ≤ α`（小于等于），这是当前版本的定义。
- 所有网络都是无环的扩散树；Sandbox 会拒绝会形成环的边。
- Efficiency 的 β window 从左侧的 seed 开始向右展开，而不是从传播末期倒着选。
- 权重目前固定为 repost 1.0 / comment 1.5；不是页面控件。
