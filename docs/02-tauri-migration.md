# Tauri + React 迁移开发文档

> 状态：**权威规划**（2026-08 定稿） · 本文档是当前的开发基准。
> RN 阶段的选型记录见 [01-tech-selection.md](01-tech-selection.md)（已标注历史存档）。

---

## 0. TL;DR

- **决策**：客户端框架由 React Native 切换为 **Tauri 2 + React (DOM)**。目标平台不变：**Windows + Android**。
- **核心论据**：RN 的成本集中在"原生桥接抽象层"（TurboModule/codegen/feature-flag 双系统/VS 版本锁定），实测已构成硬阻塞；而本项目的原生需求极薄（仅"spawn 引擎进程 + 流式读 stdout"），Tauri 把这个问题还原成普通的进程管理，无框架抽象税。
- **保留资产**：`packages/*` 六个纯 TS 包（规则内核、UCI 驱动、会话编排、持久化接口，63 个测试全绿）**100% 复用，零改动**。UI 设计（双风格主题、布局、交互）平移。
- **顺序**：Windows 先行（最快见效）→ Android 跟上 → 打磨迭代。

---

## 1. 决策背景：为什么从 RN 切换

### 1.1 RN 阶段成果（全部保留）

| 成果 | 状态 |
|---|---|
| `packages/rules-core` 统一规则抽象（`RulesAdapter`/`Side`/UCI 坐标着法/`pieceAt`） | ✅ 完成并测试 |
| `packages/rules-chess`（chess.js 封装） | ✅ |
| `packages/rules-xiangqi`（vendor xiangqi.js + 类型 + 已知分歧记录） | ✅ |
| `packages/engine-uci` UCI 协议解析/驱动/强度映射 | ✅ |
| `packages/engine-process` 传输抽象（`EngineTransport`/`EngineSpawnSpec`） | ✅ 接口保留，适配器重写 |
| `packages/game-session` 会话状态机/时钟/辅助分析（MultiPV 占空比、suspend/resume 功耗策略） | ✅ |
| `packages/persistence` 存储接口 + memory/node-file 实现 | ✅ |
| 引擎集成方案实证：Stockfish 18 / Pikafish 2026-01-02 真实握手+搜索；perft 对拍；Android W^X 分发方案（jniLibs `lib*.so` + `nativeLibraryDir` exec） | ✅ |
| UI 设计验证：双风格（国象木质感 / 象棋纸墨感）在真机截图确认可行，视觉达标 | ✅ 设计保留，渲染层平移 |
| 截图迭代工作流（模拟器/窗口截屏 + 读图分析） | ✅ 工作流保留 |

### 1.2 阻塞问题证据链（切换决策依据）

RN 路线在"引擎桥"这最后一步连续遭遇框架抽象层问题，均有实证：

1. **Legacy module 注册不可用（bridgeless/Fabric）**
   - 现象：`TurboModuleRegistry.getEnforcing('ChessEngines') → could not be found`，无 cause 日志。
   - 排查过程：手动注册 → `BaseReactPackage` + FQCN → codegen TurboModule（spec 基类）→ 逐层排除后，Java 侧 `getModule('ChessEngines') → creating` 成功，但 JS 侧仍拿不到。
2. **根因（读 RN 源码实锤）**：feature flag 双系统不一致。
   - Java 侧：`ReactNativeNewArchitectureFeatureFlags.useTurboModuleInterop()` = true（bridgeless 默认）→ Java delegate 正常创建模块；
   - C++ 侧：`ReactNativeFeatureFlagsDefaults.h` 中 `useTurboModuleInterop() { return false; }` → C++ TurboModuleManager 拒绝把 Java LegacyTurboModule 转成 JSI，返回空。
   - 可修（index.js 顶部 JS override 两行），但：**修一个 flag 不能改变"每层抽象都可能藏同类黑盒"的结构性风险**。
3. **Windows Debug 构建启动即崩**（`0xc0000409`，最小 JS 复现 → 纯原生层）：RNW 0.84 要求 VS ≥18.6，本机 18.5.2；静默更新要求提权 shell（`5007` 日志实锤）。即便升级通过，RNW 的版本锁定将长期存在。
4. **结构性判断**：上述问题都不是业务 bug，而是"框架桥接抽象"的固有税。RN 每次大版本升级都可能重踩。而本项目的原生需求只有一个：**spawn 一个进程并读它的 stdout**。

### 1.3 对比结论

| 维度 | RN（实测） | Tauri 2（评估） |
|---|---|---|
| 引擎进程桥 | TurboModule/codegen/feature-flag 三层抽象，黑盒难查 | Rust `std::process::Command` + stdout 流；Android 为 Tauri 插件（Kotlin ProcessBuilder，现有逻辑平移） |
| Windows 工具链 | VS ≥18.6 锁定 + RNW 版本节奏 | Rust stable + MSVC Build Tools 基础版，无版本锁定 |
| UI 渲染 | Fabric 原生渲染 | 系统 WebView（Win: WebView2 / Android: System WebView）；棋盘 UI 为基础 CSS，风险低 |
| 业务逻辑 | 纯 TS 包 | **同一批包直接复用**（浏览器环境，纯计算无障碍） |
| 包体 | Debug APK 165MB（引擎 114MB 为大头，RN runtime 次之） | 预计更小（无 RN runtime/Hermes） |
| 已知风险 | 框架抽象黑盒（已实锤） | 生态年轻（文档少）；Android WebView 碎片化（低影响）；Tauri Android 打包链较新 |

> 备注：用户此前对 Tauri 的顾虑（"移动端抽象不行"）经重新校准为：Tauri 移动端短板在**复杂原生 UI 集成**，本项目移动端只需要 WebView 壳 + 一个进程插件，恰好避开。

---

## 2. 目标架构

### 2.1 总体结构

```
apps/desktop/
├── src-ui/                  # 前端（Vite + React DOM + TS）
│   ├── theme/               # CSS variables 版双风格（平移自 RN theme）
│   ├── components/          # 棋盘（DOM 绝对定位）/ 顶栏 / 控制排 / 着法带 / 辅助面板 / 结果浮层
│   ├── screens/             # Home / Game / Diagnostics
│   ├── state/               # useGameSession（平移）+ engines.ts（Tauri 适配）
│   └── transport/tauri.ts   # EngineTransport 的 Tauri 实现（invoke + listen）
├── src-tauri/
│   ├── src/
│   │   ├── main.rs / lib.rs
│   │   ├── engines.rs       # 引擎进程管理：spawn/写行/停止/stdout→事件
│   │   └── paths.rs         # 引擎二进制定位（资源目录）
│   ├── capabilities/        # Tauri 2 权限清单
│   ├── icons/
│   └── tauri.conf.json      # 窗口/打包/resources（engines 目录）
├── index.html
├── vite.config.ts
└── package.json

packages/                    # 不动，直接以 workspace 源码引用
├── rules-core / rules-chess / rules-xiangqi
├── engine-uci / engine-process(接口保留) / game-session / persistence

plugins/android-engine/      # Phase A：Tauri Android 插件（Kotlin）
├── android/.../EnginePlugin.kt   # ProcessBuilder + nativeLibraryDir（W^X 方案不变）
└── ...
```

### 2.2 技术栈与版本

| 项 | 选择 | 说明 |
|---|---|---|
| Tauri | 2.x stable | 以官方文档为准；Windows 用 WebView2（Win10/11 自带） |
| Rust | stable（MSVC target） | 只需基础 MSVC Build Tools，**无 VS 版本锁定** |
| 前端 | Vite + React + TypeScript | 标准 Web 工程，摆脱 Metro/自定义 resolver |
| 包管理 | pnpm（沿用） | workspace 增加 `apps/desktop` |
| Android | Tauri Android + Kotlin 插件 | 需 Android NDK（Rust 交叉编译用）——**前置检查项** |
| 状态/样式 | React hooks + CSS variables + 普通 CSS | 不引入重状态库；棋盘用绝对定位 DOM |

### 2.3 复用矩阵（RN → Tauri）

| RN 产物 | 去向 |
|---|---|
| `packages/*`（6 包） | **原样复用**（纯 TS/浏览器兼容；`persistence` 的 node-file 实现仅测试用，桌面走 Tauri fs/sqlite 适配器） |
| `theme/games.ts` 调色板与规格 | → CSS variables（`--board-light` 等），结构不变 |
| `ChessBoardView` / `XiangqiBoardView` | → DOM 版：格子/线条/棋子全部 `div` 绝对定位；交互（点选/合法点/提示/上一步高亮）逻辑平移 |
| `GameChrome`（TopBar/Status/Controls/MoveList/Assist/ResultOverlay） | → DOM 组件，逻辑平移 |
| `useGameSession` hook | → 平移（把 `require('react-native')` 等平台点替换为 Tauri 适配层） |
| `state/engines.ts`（路径解析/profile/工厂） | → 平移，`spawnSpecFor` 改由 Rust 端定位（见 §3） |
| Kotlin `ChessEnginesModule`（ProcessBuilder/stdout 线程/事件） | → 平移进 Tauri Android 插件 |
| RN 的 android//windows 原生工程、Metro 配置 | **废弃**（保留在 git 历史） |

---

## 3. 引擎桥设计（核心）

### 3.1 统一接口（不变）

`packages/engine-uci` 的 `EngineTransport`（write/kill/exited/onLine/onIOError）与 `UciEngineDriver` **原样复用**。新增 `apps/desktop/src-ui/transport/tauri.ts`：

```ts
export function createTauriTransport(id: number, profile: string): EngineTransport {
  // spawn: invoke('spawn_engine', { profile }) -> engineId
  // write: invoke('engine_write', { id, line })
  // kill : invoke('engine_stop', { id })
  // onLine: listen(`engine://line/${id}`, ev => cb(ev.payload.line))
  // exited: listen(`engine://exit/${id}`) -> resolve(code)
}
```

### 3.2 Windows：Rust 实现（`src-tauri/src/engines.rs`）

- `spawn_engine(profile)`：
  - 定位二进制：`resource_dir()/engines/<stockfish|pikafish>.exe`（`tauri.conf.json > bundle > resources` 打包 `engines/`）；
  - `std::process::Command::new(...)` + `stdin/stdout/stderr` piped；
  - `tauri::async_runtime::spawn` 读 stdout：按行 `BufReader::lines()` → `app.emit("engine://line/<id>", ...)`；
  - stderr：排空（防管道阻塞）；
  - `wait()` → `app.emit("engine://exit/<id>", code)`。
- `engine_write(id, line)`：写 stdin + `\n` + flush；
- `engine_stop(id)`：kill 子进程；
- 多实例：`HashMap<u32, EngineChild>` + `Mutex`；id 自增。
- 事件频率评估：UCI info 行在 movetime ≤3s 下为每秒几十~几百行，Tauri event（JSON over IPC）可承载；辅助模式如遇高频可后续在 Rust 侧做 100ms 合帧（预留）。

### 3.3 Android：Tauri 插件（Kotlin）

- 插件 `EnginePlugin`：
  - `spawn(profile)`: `ProcessBuilder(nativeLibraryDir + "/lib<name>.so")`（W^X 方案与 RN 阶段完全一致：`jniLibs/arm64-v8a/lib*.so` + `useLegacyPackaging=true`）；
  - stdout 读线程 → `Channel`/`emit` 回 JS；
  - `writeLine/stop` 同构。
- NNUE：`libpikafish_nnue.so` 同法打包，`EvalFile` 指向 `nativeLibraryDir/libpikafish_nnue.so`。
- 备选（Phase A 之后的优化）：Rust 直接 `Command` spawn `nativeLibraryDir` 二进制（省一层插件），需处理 JNI 取路径——暂不采用。

### 3.4 引擎分发

| 平台 | 方式 |
|---|---|
| Windows | `engines/` 作为 Tauri resources 打包（stockfish.exe / pikafish.exe / pikafish.nnue）；开发期脚本从 `third_party/engines/windows-x64/` 拷贝 |
| Android | `jniLibs/arm64-v8a/lib{stockfish,pikafish}.so` + `libpikafish_nnue.so`；脚本沿用 `scripts/sync-android-engines.ps1`（目标路径改为 Tauri 工程的 jniLibs） |

---

## 4. UI 平移指南

### 4.1 RN → DOM 映射

| RN | DOM |
|---|---|
| `View` + `StyleSheet` | `div` + CSS class（样式值 1:1 平移） |
| `Text`（fontWeight/letterSpacing/textShadow） | `span/div` + `font-weight/letter-spacing/text-shadow` |
| `Pressable` | `button/div` + `cursor:pointer` + `:active` |
| `SafeAreaView`（safe-area-context） | `env(safe-area-inset-*)` padding |
| `Modal` + `animationType="fade"` | 固定定位遮罩 + CSS transition |
| `ScrollView horizontal` | `overflow-x: auto` |
| `useWindowDimensions` | `resize` 监听 / CSS `min()` |
| 绝对定位棋盘元素 | 相同（`position:absolute` + 像素值） |

### 4.2 主题系统

`theme/games.ts` 的两个调色板 → `src-ui/theme/chess.css` / `xiangqi.css`（CSS variables 挂在游戏根容器上），组件内用 `var(--...)`。切换游戏 = 切根 class。

### 4.3 棋盘要点（已验证的设计不变）

- 国象：8×8 格 + 坐标框 + 字形棋子（`\u265A..` 实心字形，text-shadow 立体感）；
- 象棋：9×10 交叉点 + 墨线（含河界断线）+ 双线边框 + 九宫斜线（CSS `transform: rotate`，`transform-origin` 按象限）+ 圆盘棋子（border 环色 + 书法字）+ 楚河漢界字带；
- 交互：点选己子 → 合法点圆点 → 点落点走子；上一步起讫染色；提示蓝标；
- **注意**：象棋方向已修复的结论保持——ICCS rank0 = 红方底线 = 屏幕底部（执红时），y = `(9 - rank) * cell + pad`。

### 4.4 会话接线

`useGameSession` 平移要点：
- 构造 `GameSession` 时注入 `engineRunnerFactory` / `analysisFactory`（内部用 Tauri transport）；
- 事件订阅 → `setState`（与 RN 版相同）；
- `suspend()/resume()` 接浏览器 `visibilitychange`（替代 RN `AppState`）。

---

## 5. 里程碑与验收

### Phase W1 — Windows 骨架 + UI 平移（先行）
- [ ] `apps/desktop` 脚手架：Vite + React + TS + pnpm workspace 接入；`tauri init`；`tauri dev` 跑通空白窗口
- [ ] 主题 CSS variables + Home/Game 屏幕平移（先用假数据渲染棋盘）
- [ ] 两棋种棋盘 DOM 化 + 点选交互（纯前端，规则层接上）
- **验收**：无引擎情况下，主页→对局页→点选走子（本地规则校验）全部可用；双风格截图达标

### Phase W2 — 引擎桥 + 全链路
- [ ] `engines.rs`：spawn/write/stop/stdout 事件/崩溃退出事件
- [ ] `transport/tauri.ts` + `useGameSession` 接真实引擎（对手/提示/辅助三实例策略不变）
- [ ] `fetch:engines` + 资源打包；`suspend/resume` 接 `visibilitychange`
- **验收**：与 Stockfish/Pikafish 完成真实对局（截图）；辅助面板出分数与变着；提示箭头/高亮工作

### Phase W3 — 打包与打磨
- [ ] `tauri build`（NSIS/MSI）+ 引擎资源入包；图标/窗口元数据
- [ ] UI 细节打磨（截图迭代：间距/字重/河界排版/棋子字形）
- **验收**：安装包在干净 Windows 上可装可玩

### Phase A1 — Android 插件
- [ ] 前置：安装 Android NDK（Rust 交叉编译）；`tauri android init`
- [ ] `plugins/android-engine`（Kotlin ProcessBuilder 平移）+ JS 传输适配
- [ ] jniLibs 引擎同步脚本改造
- **验收**：模拟器（Medium_Phone_API_36.1）人机对局跑通；`suspend/resume` 接 `visibilitychange`

### Phase A2 — Android 打包与验证
- [ ] `tauri android build`（APK/AAB）；签名配置
- [ ] 真机冒烟 + 功耗策略验证
- **验收**：APK 安装可玩；切后台自动挂起

### Phase P — 持续打磨（截图迭代常态化）
- 每轮：改样式 → 截图 → 读图 → 修；建立视觉回归基线图库

---

## 6. 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| Tauri Android 插件 API 年轻（文档少） | 中 | 我们的需求面极窄（spawn/写行/事件）；Kotlin 逻辑已在 RN 阶段验证，平移即可；卡壳时备选 Rust 直 spawn |
| Android NDK 未安装 | 低 | `sdkmanager ndk;26.x` 一次性解决（Phase A 前置检查） |
| WebView 碎片化（Android） | 低 | UI 仅用基础 CSS（flex/absolute/transform）；不依赖新 CSS 特性 |
| 高频 info 行 IPC 压力 | 低 | 默认 movetime 模式行率低；辅助 infinite 模式预留 Rust 侧合帧 |
| Rust 学习曲线 | 低 | 引擎桥逻辑简单（无复杂所有权场景）；模板代码即 80% |
| 事件泄漏/进程残留 | 中 | 前端卸载时 `invoke('engine_stop')` 全量清理；Rust 侧 app 退出时 kill all（对齐 RN 版 `invalidate()`） |

---

## 7. 现有仓库处置

| 路径 | 处置 |
|---|---|
| `packages/*` | 保留（复用） |
| `apps/chessapp`（RN） | **冻结保留**：作为 UI 平移的参考实现与回退选项；Tauri 版稳定后可归档删除 |
| `apps/chessapp/spec`、android/windows 原生工程 | 随 RN 冻结（Kotlin ProcessBuilder 逻辑平移进 Tauri 插件） |
| `scripts/fetch-engines.ps1`、`sync-android-engines.ps1`、`smoke-engines.ts`、`probe-perft.ts` | 保留（引擎获取/验证与框架无关） |
| `docs/01-tech-selection.md` | 历史存档（头部加注记） |
| Metro/Gradle/RNW 相关配置 | 随 RN 冻结 |

---

## 8. 开发工作流

```powershell
# 日常开发（Windows）
pnpm --filter desktop tauri dev        # Vite HMR + Rust 增量编译

# 截图迭代（复用现有脚本）
powershell scripts/screenshot-window.ps1 -ProcessName chesslab -OutFile .shot.png

# 引擎准备
pnpm fetch:engines                     # 下载官方二进制到 third_party/
# Phase W2 起由 tauri build/dev 自动携带（resources），或手动拷至
# apps/desktop/src-tauri/target/... 旁的 engines/（开发期）

# 打包
pnpm --filter desktop tauri build
```

**Android（Phase A）**
```powershell
pnpm --filter desktop tauri android init
pnpm --filter desktop tauri android dev    # 连接模拟器/真机
pnpm --filter desktop tauri android build  # APK/AAB
# 截图：adb shell screencap + pull（现有工作流）
```

---

## 9. 待定决策（实现中确认）

- [ ] 引擎资源打包方式：Tauri `resources` vs sidecar（倾向 resources，路径处理更直白）
- [ ] 持久化落地：Phase W2 先内存 + JSON 文件（tauri-plugin-fs）；SQLite（tauri-plugin-sql）按需后置
- [ ] Android 上 Rust 直 spawn（绕过 Kotlin 插件）是否作为 A2 优化项
- [ ] 自动更新（tauri-plugin-updater）是否纳入 W3
