# 架构与关键决策记录

> 状态：**当前权威** · 面向 `0.4.0-alpha`（实验性中国象棋研究版）。
> 本文档取代了此前的 `01-tech-selection.md`（RN 阶段选型）与 `02-tauri-migration.md`（迁移规划）——迁移已完成，规划性内容不再保留。

---

## 0. 一句话

**Tauri 2 + React DOM 外壳，纯 TS 的规则 / 引擎 / 会话包，Rust 只做一件事：spawn 引擎进程并把 stdout 流式转发回前端。**

---

## 1. 项目定位

实验性 / 研究性分支。相对上游 ChessNext 的两项激进裁剪：

1. **单一棋种**：只保留中国象棋。国际象棋相关内容（含 Stockfish、chess.js、国象棋盘与题库）已全部移除。
2. **缺陷清理**：见 [`CHANGELOG.md`](../CHANGELOG.md) `[0.4.0-alpha]`。

版本 `0.4.0-alpha` 表示接口与行为仍可能变动。

---

## 2. 技术栈与版本

| 项 | 选择 | 说明 |
|---|---|---|
| 桌面壳 | Tauri 2.x stable | Windows 用 WebView2 |
| 前端 | Vite 5 + React 18 + TypeScript | 标准 Web 工程，无 Metro / 自定义 resolver |
| 移动端 | Tauri 2 Android（Rust 交叉编译 + Gradle） | 需 Android NDK；`gen/android` 工程 |
| 包管理 | pnpm workspace | `apps/*` + `packages/*` |
| 状态 / 样式 | React hooks + CSS variables | 不引入重状态库 |
| 引擎 | Pikafish 2023-03-05（GPL-3.0，独立进程） | 版本与下载地址固定在 `scripts/fetch-engines.ps1`；此版本仍提供 `UCI_Elo` / `Skill Level` |
| 规则内核 | vendored xiangqi.js（BSD-2）+ 自维护长将裁决 | 不依赖引擎做合法性校验（引擎缺失也能玩） |
| 模型推理 | onnxruntime-web 1.30（WebGPU → WASM） | 仅模式 3；纯 TS 编码层在 `packages/engine-onnx`，可在 Node 下单测 |
| 测试 | Vitest（12 套件 / 116 用例） | 纯逻辑包在 Node 下可测 |

---

## 3. 分层

```
UI  apps/desktop/src-ui
    screens / components（棋盘、chrome、DifficultyPicker/Modal）/ state / theme / transport
      │  SessionEvent 流 + React state
GameSession  packages/game-session
    状态机 · 时钟 · 辅助分析 · suspend/resume · 完整历史透传 · 防重复护栏
      │  EngineRunnerFactory（按棋力方案注入不同实现）
      ├─ 模式 1/2 → engine-uci
      │     UCI 解析 · FifoDriver · EngineTurnStrategy（宿主弱化 / 引擎原生选项）
      │       │  EngineTransport  ←—— 关键抽象缝
      │     transport/tauri.ts   invoke + listen(engine://line/<id>)
      │     engines.rs           Rust：spawn / write / stop / stdout 流式事件
      └─ 模式 3   → engine-onnx
            编码 / 视角归一化 / 掩码 softmax / 温度 / 杀棋守卫
              │  OnnxSession（注入）
            state/onnx.ts      onnxruntime-web（WebGPU → WASM）
rules-core → rules-xiangqi
puzzles（112 局）· persistence（接口保留，未接入）
```

### 分层原则

- **纯逻辑包零 React 依赖**：`rules-*` / `engine-uci` / `game-session` / `puzzles` / `persistence` 全部可在 Node 下直接测试。
- **传输即插件**：新平台只需实现一个 `EngineTransport`（`write` / `kill` / `exited` / `onLine` / `onIOError`）。
- **残局即数据**：`Puzzle` 结构与引擎、规则层解耦。
- **单成员接缝**：`GameType` 收窄为 `'xiangqi'`，但 `RulesAdapter` 抽象与各层泛型保留——将来加回第二种棋只需新增一个适配器 + 一套主题令牌，不动引擎与会话层。

---

## 4. 引擎桥（核心）

### 4.1 统一接口

`EngineTransport`（见 `packages/engine-uci/src/types.ts`）是唯一的平台缝：

```ts
interface EngineTransport {
  write(line: string): void;
  kill(): void;
  readonly exited: Promise<number | null>;
  onLine(handler: (line: string) => void): void;
  onIOError(handler: (err: Error) => void): void;
}
```

实现有两处，彼此不共享代码：

| 实现 | 位置 | 用途 |
|---|---|---|
| Tauri 桥 | `apps/desktop/src-ui/transport/tauri.ts` | 应用运行时（`invoke` + `listen`） |
| Node child_process | `scripts/node-transport.ts` | 冒烟测试、perft 对拍等开发工具 |

> Node 版**刻意放在 `packages/` 之外**，这样任何打包器都不会把 `node:child_process` 拖进 WebView 构建。

### 4.2 Windows / 桌面（`src-tauri/src/engines.rs`）

- `spawn_engine(profile)`：定位二进制（`resource_dir()/engines/*.exe`，再退到 dev 期的 `apps/desktop/engines` 与 `third_party/engines/windows-x64/...`）→ `std::process::Command` + `stdin/stdout/stderr` piped → 独立线程按行 `BufReader::lines()` → `app.emit("engine://line/<id>")`。
- **stderr 单独线程排空**，防止管道写满阻塞子进程。
- `engine_write(id, line)`：写 stdin + `\n` + flush。
- `engine_stop(id)`：从注册表移除并 kill。
- 退出检测：200ms 轮询 `try_wait()` → `engine://exit/<id>`。
- Windows 下 `creation_flags(0x08000000)` 避免弹出控制台窗口。
- 多实例：`HashMap<u32, EngineChild>` + `Mutex`，id 自增。

### 4.3 Android（W^X 方案）

Android 10+ 禁止从可写应用目录 `exec()`，但允许从 `nativeLibraryDir` 执行。做法：

1. 引擎二进制改名为 `libpikafish.so` 放进 `jniLibs/arm64-v8a/`；
2. `build.gradle.kts` 开启 `packaging { jniLibs { useLegacyPackaging = true } }`，安装时解压到磁盘；
3. 运行时执行 `<nativeLibraryDir>/libpikafish.so`；
4. NNUE 同样伪装为 `libpikafish_nnue.so`（`nativeLibraryDir` 可读），由 `EvalFile` 指向。

`nativeLibraryDir` 的定位顺序（`engines.rs::get_android_native_library_dir`）：`dladdr` 自身 → `/proc/self/maps` → `current_exe` 父目录 → JNI `ApplicationInfo.nativeLibraryDir`（`panic` 安全包裹）。

### 4.4 引擎分发

| 平台 | 方式 |
|---|---|
| Windows | `engines/` 作为 Tauri resources 打包（`pikafish.exe` / `pikafish.nnue`）；`build.js` 构建前从 `third_party/engines/windows-x64/pikafish/` 拷入 |
| Android | `jniLibs/arm64-v8a/libpikafish.so` + `libpikafish_nnue.so`；`build.js` 与 `pnpm sync:jniLibs` 均可同步 |

### 4.5 进程预算

每局最多三个引擎实例：**对手 1 + 辅助分析 1（常驻复用）+ 提示 1（懒加载复用）**。离开对局页 `shutdownEngines()` 全量回收。

---

## 5. 规则层

### 5.1 归一化

- 全棋种统一 `Side = 'w' | 'b'`，象棋中 `w` = 红（先手）、`b` = 黑；
- xiangqi.js 内部使用 `'r' | 'b'`，`XiangqiRules` 在 FEN 边界做 `w ↔ r` 转译；
- 着法统一 ICCS 坐标（`h2e2`），与引擎 `position ... moves ...` 完全同构，**边界零翻译**。

### 5.2 重复与长将裁决

- `XiangqiRules` 增量维护 `posFens` / `posCounts`（`positionKey` = 棋盘布局 + 走子方），`undo` / `reset` 正确回退；
- 同一局面第三次出现时，取**最后三次出现的并集窗口**，用全新局回放着法、以精确 `isCheck()` 判定是否「着着将军」；
- 单方长将 → 将军方判负（`perpetual-check`）；双方均长将或良性重复 → 和棋。**零误判**（非启发式）。

### 5.3 perft 与引擎对拍

`XiangqiRules.perft()` 遍历**已验证的合法着法列表**，与 Pikafish 对拍：

| 深度 | 本规则库 | Pikafish | 逐根着法 |
|---|---|---|---|
| 1 | 44 | 44 | 44/44 |
| 2 | 1920 | 1920 | 44/44 |
| 3 | 79666 | 79666 | 44/44 |
| 4 | 3290240 | 3290240 | 44/44 |

> **为什么不用 vendor 自带的 `perft()`**：它用 `generate_moves({ legal: false })` 取伪合法着法，随后判断 `if (!king_attacked(turn))`——但 `make_move` 已经把 `turn` 翻转为对手。结果是既统计了「送将」的非法着法，又丢弃了「将军」的合法着法，depth 3 少算 220 个节点（79446 ≠ 79666）。这是调试工具的缺陷，**着法生成器本身是正确的**（逐根着法可证）。复现：`pnpm probe:perft 4 --divide`。

### 5.4 棋力方案与策略缝

三个模式共用同一套会话与 UI，差异被收敛成一个对象：

```ts
interface EngineTurnStrategy {
  readonly id: 'host-weakened' | 'engine-options';
  plan(args: { level: number; clock?: {...} }): TurnPlan;   // { options, spec }
}
```

`createUciRunner(driver, strategy)` 只按 `plan()` 下发的 `options` 与 `spec.limits` 执行，
因此新增方案不需要改动 runner、会话或界面。

**策略是「按方」解析的**：`EngineRunnerFactory` 的入参带 `side`，`makeSessionFactories()`
在每次建 runner 时用 `modeFor(side)` 决定该方用哪套方案。观战模式双方各持一个独立
runner，所以红黑可以**异构**（红方模式 1、黑方模式 3 等）；辅助分析只要有任一方是
UCI 引擎就可用。

| 模式 | 策略 | 做法 | 随机 |
|---|---|---|---|
| 1（默认） | `hostWeakenedStrategy()` | `nodes` + 浅 `depth`（跨设备确定）+ `movetime` 慢机安全帽 | 仅近分着法间 |
| 2 | `engineOptionsStrategy(overrides)` | 直接下发引擎原生 `UCI_Elo` / `Skill Level` 等选项（`multiPv: 1`） | 无（同局面同选项恒同着） |
| 3 | `createOnnxRunner()`（不走 UCI 进程） | WebView 内 ONNX 档位模型推理 | 按温度预设采样 |

**模式 1 · 宿主弱化**

- **近分随机**：仅在候选着分差落在模糊窗口内、不致命、不送杀 / 不被杀时随机；否则必走最优着。策略是「像人一样在几个等价计划中选一个」，而非「故意走错」；
- **防重复护栏**：`occurrencesAfter(uci)` 探针否决会走进重复局面的**随机候选**；引擎自己的 bestmove 豁免（若它选择重复，交由客户端裁决器按规则判定）。

**模式 2 · 引擎原生选项**

Pikafish **2023-03-05 是最后一个提供原生棋力选项的版本**（`UCI_Elo` 1350–2850、
`Skill Level` 0–20、`UCI_LimitStrength`）；更晚的版本移除了它们，所以引擎版本与模式 2 是绑定的。
选项表 `PIKAFISH_STRENGTH_OPTIONS` 由实际 `uci` 输出转录，供模态框做范围校验与展示。

**模式 3 · ONNX 档位模型**

编码与推理策略全部在 `packages/engine-onnx`（纯 TS，可在 Node 下单测），
`onnxruntime-web` 只作为注入的 `OnnxSession` 出现。三个最容易静默出错的地方
（黑方视角归一化、着法索引 `8099 - m` 翻转、合法掩码必须用模型视角）都有专门用例覆盖。

### 5.5 完整历史透传

发送 `position fen <起始> moves <全程>` 而非裸 FEN，消除引擎「重复盲」：引擎能正确评估重复与长将惩罚，皮卡鱼内置亚洲规则长将评分亦能生效。

---

## 6. 会话层

`GameSession`（`packages/game-session/src/session.ts`）负责规则执行、人类 / 引擎轮转、时钟、结果与事件流；UI 只订阅并喂入人类着法。

要点：

- **事件流**：`started / turn / move / thinking / engineInfo / clock / assist / result / error`。
- **玩家抽象**：`PlayerConfig = human | engine`，在线对弈只需新增一种 `PlayerConfig`（着法来自 websocket），其下各层不动。
- **悔棋**：撤回至人类回合（人机模式连带撤回对方应着）。
- **辅助分析**：独立引擎进程（不与对手共用，UCI 引擎只有一个搜索控制流）；`pauseOnOpponentTurn` 默认开启，避免双引擎同时满载。
- **移动端功耗**：`suspend()` 取消在飞搜索、暂停时钟、停止分析；`resume()` 恢复并**重新发起**被取消的引擎回合（否则对局会卡住）。
- **时钟**：`GameClock` 注入 `setInterval` / `clearInterval` / `now`，可在 Node 下确定性测试。

---

## 7. UI 平移要点（RN → DOM）

| RN | DOM |
|---|---|
| `View` + `StyleSheet` | `div` + 内联样式 / CSS class |
| `Pressable` | `button` + `:active` |
| `SafeAreaView` | `env(safe-area-inset-*)`（顶部 inset 由 `TopBar` 自己持有，让状态栏区域与标题栏同色） |
| `Modal` + `animationType="fade"` | 固定定位遮罩 + CSS transition |
| `ScrollView horizontal` | `overflow-x: auto` |
| `AppState` | `visibilitychange` |

棋盘：

- 象棋为 **9×10 交叉点**棋盘，棋子落在交点上，`y = pad + (orientation === 'w' ? 9 - rank : rank) * cellY`（ICCS rank 0 = 红方底线）；
- 墨线（含河界断线）、双线边框、九宫斜线（`transform: rotate` + 按象限的 `transform-origin`）、楚河漢界字带；
- 交互：点选己子 → 合法点圆点 → 点落点走子；上一步起讫染色；提示蓝标。

主题：单一 `theme-xiangqi` CSS 变量集，组件零硬编码色值。

---

## 8. 已验证 / 验收

| 项 | 命令 | 结果 |
|---|---|---|
| 类型检查（全仓 + 应用） | `pnpm typecheck`、`npx tsc --noEmit`（apps/desktop） | 通过 |
| Rust 构建 | `cargo check`（apps/desktop/src-tauri） | 通过 |
| 单元测试 | `pnpm test` | **12 套件 / 116 用例全绿** |
| 真实引擎链路 | `pnpm smoke:engines` | 握手 → EvalFile → 搜索 → 合法着法校验通过 |
| 模式 2 原生选项 | `pnpm smoke:engines` | 确认上报 `UCI_LimitStrength` / `UCI_Elo 1350..2850` / `Skill Level 0..20`，两个极端 Elo 各搜索一次且着法合法 |
| perft 对拍 | `pnpm probe:perft 4 --divide` | 与 2023-03-05 逐根着法完全一致 |
| 前端生产构建 | `pnpm build:frontend` | 通过（含 ONNX 模式） |

---

## 9. 已知局限与后续方向

| 局限 | 说明 | 计划 |
|---|---|---|
| 长捉（`perpetual-chase`） | 捉 / 兑 / 献、牵制、保护、过河兵例外等数十条例外未实现，目前一律按和棋 | 引入简化版长捉识别，再逐步补全 |
| 双方均禁（双长将等） | 按和棋处理，未细分「先提议变着」/ 双负 | 按《象棋竞赛规则》细化 |
| `persistence` 未接入 | 无对局存储 / 无棋谱导出（`GameRepository` 接口与 memory / node-file 实现已就绪） | 接 Tauri fs 或 SQLite |
| vendor 允许「吃将」 | 非法 FEN（被将军方轮走）下可走出「吃掉对方将帅」。正常对局不可能到达该局面 | 可在适配层拒绝吃将着法 |
| 残局 `solution` 仅参考 | 早期注释称「基本杀法 · 单步可解」，实测并非单步杀着；已更正注释 | 如需严格答案需引擎重新校验 |
| 模式 3 无辅助分析 | 模型只出 policy + value，没有可加深的 MultiPV 流 | 可用 top-N 概率自行渲染分析条（需扩展 `AssistLine`） |
| 模式 3 资产体积 | 模型 23.2 MB + onnxruntime 运行时 40.6 MB；Vite 还会额外 emit 一份它静态引用的 WebGPU wasm | 可改为按需下载 / 只保留一套 wasm |
| 模式 2 与引擎版本绑定 | 只有 ≤ 2023-03-05 的 Pikafish 提供 `Skill Level` / `UCI_Elo` | 换引擎时同步更新 `PIKAFISH_STRENGTH_OPTIONS` |
| `images/` 截图 | 首页与设置页布局已变，设置页 / 残局页截图已移除待补拍；难度模态框尚无截图 | 补拍后写回 README |
| 截图自动化 | `scripts/screenshot-window.ps1` / `click-window.ps1` 依赖 `Get-Process ... MainWindowHandle` 取窗口，可能命中 Tauri 的隐藏辅助窗口而拍出无效图 | 改为按窗口标题枚举（`EnumWindows`）后再截图 |
