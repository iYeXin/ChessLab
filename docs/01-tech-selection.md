# 技术选型与架构决策记录

> 状态：已定稿（2026-08） · 本文档记录关键调研结论与决策理由，供后续回顾与二次评审。

## 1. 产品目标

- 双棋种单机对弈软件：**国际象棋**（Stockfish）+ **中国象棋**（Pikafish）
- 目标平台：**Android + Windows 桌面**；不做 Linux；macOS 短期搁置（架构不设障碍，未来可加）
- 单机先行，架构为未来扩展预留空间：联网对弈、云评测、账号系统、Web 版
- 引擎固定使用官方发布物：Stockfish 18（2026-01-31）、Pikafish 2026-01-02

## 2. 核心决策一览

| 决策点 | 结论 | 关键理由 / 备选 |
|---|---|---|
| 客户端框架 | **React Native 0.84.1**（New Architecture/Fabric） | 团队 TS 生态复用最大；Windows 由微软官方分支 react-native-windows 0.84 支撑（要求 VS2026 ≥18.6）；备选 Flutter（胜在 Linux 与成熟度）、Tauri v2（被否：移动端抽象差） |
| 引擎集成方式 | **独立 OS 进程 + UCI 文本协议**（stdio） | 官方直接提供全平台二进制零编译成本；进程隔离崩溃不影响 UI；GPL 合规最干净。否决内嵌 FFI/JNI 链接 |
| Android 引擎分发 | `jniLibs/<abi>/lib*.so` + `useLegacyPackaging=true`，运行时从 `nativeLibraryDir` exec | Android 10+ W^X 策略禁止从应用数据目录 exec，但 nativeLibraryDir 明确允许且 Google 承诺维持 |
| 规则内核 | 国际象棋用 chess.js(BSD-2)；中国象棋 vendor xiangqi.js(BSD-2) 并自维护 | 不依赖引擎做合法性校验（引擎离线也能玩）。dartchess 因 GPL-3 传染性被排除 |
| 状态管理/架构 | 分层 monorepo：rules → engine → session → persistence 全部纯 TS 包 | 见 §5；UI 层薄壳 |
| 未来 Web 版路径 | EngineDriver 增加 WASM Worker 传输适配器 | Stockfish 有现成 stockfish.wasm/lichess 方案；Pikafish 已有第三方网站验证 Emscripten 编译可行（需自建并长期维护补丁） |

## 3. 引擎层要点（已实测验证 ✅）

### 3.1 协议与驱动
- UCI 是纯文本行协议，`position fen ... moves ...` / `go movetime N` / info 流 / bestmove。
  stdio（原生）与 Worker postMessage（未来 Web）只是两种传输，上层无感 —— 这是 `EngineTransport`
  抽象的由来。
- 自研 `@chesslab/engine-uci`：协议解析器（含 MultiPV/mate 分数/bound 标志/info string/option 声明解析）、
  串行化搜索队列（UCI 同一时刻只允许一个 go）、握手超时、进程死亡传播。

### 3.2 两款引擎的差异（实测结论）

| 维度 | Stockfish 18 | Pikafish 2026-01-02 |
|---|---|---|
| NNUE 网络 | 内嵌于二进制 | 外部文件 `pikafish.nnue`，经 `EvalFile` 选项指定绝对路径 |
| 棋力限制 | `UCI_LimitStrength` + `UCI_Elo`(1320–3190) | **无 Skill Level 也无 UCI_Elo**（2026-01-02 实测选项表），只能靠思考时间缩放弱化 |
| 平台产物 | GitHub Release 直接提供 android armv8/armv7(+NEON/dotprod)、win/mac/linux 各 ISA | 单一 .7z 含全平台（Windows avx2…、Android armv8[-dotprod]）+ nnue 文件 |
| 许可 | GPLv3 | GPLv3 |

### 3.3 已验证事实
- Pikafish 可从 jniLibs 方案在 Android 上执行（同 DroidFish 等成熟先例）。
- 本仓库冒烟测试（Node 侧真实二进制）通过：
  - SF18 握手→搜索→一步杀 `h1h8` 正确；
  - Pikafish 握手→EvalFile 加载→开局首选 `h2e2`（中炮）落在我们规则库合法着法集合内。

### 3.4 WASM 备忘（Web 扩展路径）
- 可行性：SF 现成（lichess stockfish.wasm / npm `stockfish`）；Pikafish 无官方构建但已有第三方站点实跑，
  需自行维护 Emscripten 补丁（Makefile target、pthreads 代理、NNUE 经虚拟 FS 加载）。
- 性能约为原生 50–80%，多线程依赖 SharedArrayBuffer（站点需 COOP/COEP 跨源隔离）。
- 结论：不做"一套 WASM 跑所有平台"；仅在 Web 目标立项时作为 `EngineTransport` 新实现接入。

## 4. 平台工程要点

### Android
- `abiFilters arm64-v8a` 起步（官方引擎无 x86_64 时模拟器开发受限，后续可补拉 x86_64 构建）。
- `packagingOptions.jniLibs.useLegacyPackaging = true` 必须开启，否则 so 不解压到磁盘无法 exec。
- NNUE 文件同样以 `libpikafish_nnue.so` 名义进 jniLibs（nativeLibraryDir 可读，供 EvalFile 指向）。
- pnpm 兼容：`@react-native/gradle-plugin` 必须显式加入 devDependencies（settings.gradle 相对路径 includeBuild）。
- Gradle 9 运行 JVM 上限低于本机 Java 25，`gradle.properties` 固定 `org.gradle.java.home` 到 Temurin 21。

### Windows (react-native-windows 0.84, cpp-app 模板)
- 要求 VS2026 ≥18.6（C++ 工具集 + WinAppSDK）；本机 VS 需升级到该线。
- pnpm 兼容：`@react-native-windows/cli` 必须显式 devDependencies，否则社区 CLI 发现不了
  `init-windows` / `run-windows` 命令；工具链加载期需要 `pwsh.exe`(PowerShell 7)。
- 原生模块采用 **attributed TurboModule**（REACT_MODULE 宏，免 codegen）：`ChessEnginesModule.h`
  用 CreatePipe+CreateProcessW 实现与 Android 完全相同的桥接协议。

## 5. 架构设计

```
┌────────────────────────── UI (apps/chessapp) ──────────────────────────┐
│  棋盘渲染 / 对局界面 / 设置（后续阶段）                                  │
└───────────────▲────────────────────────────────▲──────────────────────┘
                │ SessionEvent 流                 │ playHumanMove()
│        ┌──────┴────────┐              ┌────────┴────────┐
│        │  GameSession   │◄────────────►│  GameClock      │
│        │  (编排/状态机)  │              └─────────────────┘
│        └──▲──────────▲──┘
│   EngineTurnRunner     RulesAdapter
│   (玩家抽象之一)        ├─ rules-chess  (chess.js)
│           │             └─ rules-xiangqi(vendored xiangqi.js)
│   engine-uci: UciEngineDriver(协议/队列/握手/强度映射)
│           │ EngineTransport ←—— 关键抽象缝
│   engine-process: node(child_process) | android(ProcessBuilder) | windows(CreateProcess) | wasm(未来)
└── persistence: GameRepository(memory/node-file → 设备 sqlite → 未来服务端同步)
```

分层原则：
1. **纯逻辑包零 React 依赖**，Node 下可测（当前 48 个单测全绿）。
2. **MoveSource 即扩展点**：human/engine 都是 PlayerConfig；联网=新增 RemotePlayer，不改下层。
3. **持久化是接口**：对局以"初始 FEN + UCI 着法序列"规范存储，天然可回放/同步/分享。
4. **传输即插件**：新平台/新形态（WASM）只增一个 TransportFactory。

## 6. 许可证合规

- Stockfish/Pikafish 为 GPLv3：以**独立进程 + 未修改官方二进制**分发构成聚合（aggregate），
  应用自身代码不被传染；分发时必须附带两者许可证文本与对应源码链接（记录构建 tag）。
- JS 规则库均 BSD-2（chess.js / vendored xiangqi.js），vendor 目录保留其 LICENSE。
- 若未来决定整个应用开源，可直接整体 GPLv3 化，兼容上述全部组件。

## 7. 已知债务 / 待办

| 项 | 说明 |
|---|---|
| xiangqi.js perft(3) 分歧 | 库算 79446 vs Pikafish 权威 79666（d1/d2 完全一致）。上游生成器边界 bug，测试中显式记录；计划 patch vendor 或替换内核 |
| 象棋长将/长捉 | 客户端暂只做简单三次重复判和；完整亚洲规则裁定后续实现（引擎侧已内置 computer rule） |
| Pikafish 弱化分级 | 无 UCI 棋力选项，当前仅靠思考时间曲线；必要时引入受限深度或随机扰动 |
| Windows 编译验证 | 等 VS 升级至 18.6+ 后跑通 run-windows；模块代码已就位 |
| 引擎热更新/更强 NNUE 下载 | 架构已留（文件校验+路径注入 EvalFile），未实现 |

## 8. 版本锚点

- RN 0.84.1 / RNC-CLI 20.x / react-native-windows 0.84.0 / @react-native-windows/cli 0.84.0
- Node ≥22（本机 24）/ pnpm 11（allowBuilds 配置制）/ JDK21(Temurin, gradle 用)/ VS2026≥18.6(Windows 构建用)
- Stockfish sf_18 / Pikafish 2026-01-02（fetch-engines.ps1 固定下载地址）
