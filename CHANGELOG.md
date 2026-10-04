# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/lang/zh-CN/).

## [Unreleased]

## [0.4.0-alpha] - 2026-08-27

**实验性 / 研究性分支**：由双棋种应用裁剪为**单一棋种（中国象棋）**，修复上一版遗留的一批缺陷，并加入**三套棋力方案**与**测试人员模式**。

### Added — 三套棋力方案（第二轮）

- **`EngineTurnStrategy` 抽象缝**（`packages/engine-uci`）：`TurnPlan { options, spec }`，runner 只按策略下发的选项与搜索限制执行，因此同一 runner 可服务所有模式
  - `hostWeakenedStrategy()` —— 模式 1（默认）：搜索预算（`nodes` + `depth` + `movetime` 帽）+ 近分 MultiPV 随机 + 防重复护栏，机制与上一版一致
  - `engineOptionsStrategy(overrides)` —— 模式 2：直接下发引擎原生棋力选项，`multiPv: 1` 故不做任何主机侧随机
- **模式 2 的可自定义选项**：`PIKAFISH_STRENGTH_OPTIONS` 表驱动（14 项，含 `type` / `min` / `max` / `vars` / `defaultValue`，逐项由 `pikafish-avx2.exe` → `uci` 实测转录）；`engineOptionPresetForLevel()` 把 5 个档位线性映射到引擎上报的 `UCI_Elo` 区间（1350–2850），用户覆盖优先，越界值夹到边界
- **`packages/engine-onnx`（新模式 3）**：档位模型 T1–T5 的纯 TS 接入层
  - `encoding.ts`：`rank*9+file` 方格编码、`from*90+to` 着法索引、**黑方行棋时的三重归一化**（棋盘旋转 180° + 红黑互换 + 着法索引 `8099 - m`）、`[1,17,10,9]` 平面构造、**模型视角**的合法掩码 softmax
  - `temperature.ts`：研究侧实测的温度预设（`play` / `arena` / `greedy`，按 ply 分段）
  - `mate.ts` + `runner.ts`：杀棋守卫（一步杀必走扫描**全部**合法着法；避免被一步杀，候选窗口有界）+ 概率采样
  - `tiers.ts`：T1–T5 元数据（训练量 / 离线指标）与难度→档位映射
- **应用侧模型加载**（`state/onnx.ts`）：`onnxruntime-web` 1.30，后端顺序固定 **WebGPU → WASM**，WASM 运行时本地随包（无 CDN）；会话按档位缓存复用
- **`scripts/fetch-assets.mjs` / `pnpm fetch:assets`**：把 5 个 fp16 档位模型（23.2 MB）与 onnxruntime 运行时（40.6 MB）拷入 `apps/desktop/public/`（已 gitignore）
- **测试人员模式**（设置页「实验功能」）：开启后，对局配置的「难度」「黑方棋力」与残局页的「难度」都改为弹出 `DifficultyModal`，其中统一选择棋力方案（1/2/3）、档位与该方案的具体设置；关闭后恢复原来的内联胶囊选择，已保存的方案继续生效
- `DifficultyPicker` 组件：把"内联胶囊 / 模态框"两种形态收敛到一处，三个调用点行为一致
- **观战模式可按方分别选择棋力方案（允许异构）**：
  - `EngineRunnerFactory` 的入参新增 `side`（`packages/game-session`），`ensureRunners()` 与惰性 `hint()` runner 都会传入，因此宿主能**按方**解析策略；双方本就各自持有独立 runner，异构不引入额外结构
  - 设置新增 `engineModeWhite` / `engineModeBlack`（默认 1）；`makeSessionFactories()` 用 `modeFor(side)` 在每次建 runner 时解析模式，故红方可以走模式 1 而黑方走模式 3 的档位模型
  - 辅助分析改为「**只要有一方是 UCI 引擎就提供**」（原先"全局模式 3 则不提供"），否则异构时红方是 UCI 也会丢掉分析能力
  - 难度模态框与选择器新增 `modeTarget`（`global` / `white` / `black`）：观战的红方、黑方入口各自读写自己那份设置，并在标题与提示里标注所属方
  - 设置页显示三份方案（人机/残局、观战红方、观战黑方）并说明可混用
  - 新增 3 个 `game-session` 用例锁定契约：工厂收到正确的 `side` 与**该方自己的**强度、双方 runner 是不同实例、`hint()` 也会告知行棋方
- **应用内文案精简**（不再暴露实现细节）
  - 难度模态框：删掉「本版本有三套棋力方案…」说明段、模式 1 的只读预算明细（节点 / 深度 / MultiPV / 模糊窗口）、模式 3 的训练量 / top1 / 模型路径 / 「不代表人类段位」提示 / WebGPU→WASM 与 +Elo 说明；档位行不再显示「引擎强度 N 级」
  - **模式 3 的档位改为直接选 T1–T5**：面板内的 T1–T5 列表即选择器，且模式 3 时隐藏上方「入门 / 业余 / …」档位行，避免两套选择器互相「对应」
  - 模式 2 保留选项编辑器与取值范围，去掉尾部解释；温度预设标签简化为「实战 / 评测 / 贪心（调试）」
  - 设置页「实验功能」块与引擎方案标题/提示改为短文案；选择器按钮不再显示引擎强度数字
- 首页小字由「实验性版本 · 仅供研究」改为「**实验性版本 · 仅供测试**」
- `docs/02-tauri-migration.md` 新增 §10：**APK 体积实测构成与优化方向**（143 MB 中 `lib/` 占 98%；4 个 ABI 各嵌一份前端；单 ABI + 去掉重复 wasm 后估算约 40 MB），并在 §9 记录「非 arm64 ABI 没有引擎」这一实测结论
- 新增测试：`engine-onnx` 两个套件共 27 例（含**专门针对 `8099 - m` 翻转**、黑方行棋、掩码只落在合法着法、杀棋守卫优先级）与 `engine-uci` 棋力模式 10 例（Elo 区间单调、越界夹取、覆盖优先、空值剔除）

### Changed — 第二轮

- **应用与包标识改名**：`ChessLab` → `ChessNext`（66 个文本文件）
  - npm 作用域 `@chesslab/*` → `@chessnext/*`（含两处 tsconfig `paths`）
  - Android `com.chesslab.app` → `com.chessnext.app`（`namespace` / `applicationId` / Kotlin 包目录 / `Theme.chessnext`）；`TAURI_ANDROID_PACKAGE_NAME_PREFIX` 随之变为 `com_chessnext`
  - Rust crate `chesslab` → `chessnext`，lib `chesslab_lib` → `chessnext_lib`（含 `engines.rs` 中按 `libchessnext_lib.so` 扫 `/proc/self/maps` 的硬编码串）
  - 存储键 `chesslab.settings.v1` → `chessnext.settings.v1`、`chesslab.puzzles.progress.v1` → `chessnext.puzzles.progress.v1`
  - 产物名 `ChessNext-<版本>-*`（`build.js` 与 `release.yml` 的 glob 同步）；窗口标题 `ChessNext 中国象棋`
  - 上游仓库 URL 保持不变
- **引擎版本**：Pikafish 2026-01-02 → **2023-03-05**（`.zip`），体积 24.3 MB / NNUE 17.2 MB；`fetch-engines.ps1` 改为从 zip 提取，跨平台（`Expand-Archive` / `unzip` / `tar`）
- `EngineProfile` 恢复 `supportsLimitStrength` / `supportsSkillLevel` 能力位（上一轮因只剩无此能力的版本而移除）
- `pnpm-workspace.yaml`：允许 `protobufjs` 的安装脚本（`onnxruntime-web` 的传递依赖）
- 难度/等级映射抽出到 `state/difficulty.ts`（含 `tierForLevel`），消除 hook 与引擎工厂之间的重复常量

### Verified — 第二轮

- `pnpm typecheck`、`apps/desktop` `tsc --noEmit`、`cargo check` 全部通过
- `pnpm test`：**12 套件 / 116 用例全绿**
- `pnpm smoke:engines`：新增模式 2 校验——确认引擎确实上报 `UCI_LimitStrength` / `UCI_Elo 1350..2850` / `Skill Level 0..20`，并在 Elo 1350 与 2850 下各搜索一次、校验着法合法（实测 1350 → `h2e2`、2850 → `b2e2`）
- `pnpm probe:perft 4 --divide`：与 **2023-03-05** 逐根着法完全一致（3,290,240）
- `pnpm build:frontend`：含 ONNX 模式构建通过

### Removed — 第一轮

- **国际象棋全部内容**：`packages/rules-chess`（chess.js 封装）整包删除；`ChessBoardView`；国象题库（精选 12 + 题库 80）；国象精选样例 `docs/puzzles/chess_curated_sample.json`；`images/chess-cropped.jpg`；`chessBoardStyle` 设置项与 `.theme-chess` 主题；`GameEndReason` 中仅国象可达的 `stalemate` / `fifty-move-rule`；`PieceType` 中的 `q`；`LegalMove.promotion`（象棋无升变）
- **Stockfish**：引擎档案与 `computeStrengthOptions`（`UCI_LimitStrength` / `UCI_Elo` / `Skill Level` 均为 Stockfish 特性）；`fetch-engines.ps1` / `smoke-engines.ts` / `probe-perft.ts` / `build.js` / `engines.rs` / 诊断页 / 发布工作流中的所有 Stockfish 路径
- **`packages/engine-process`**：React Native 时代遗留的传输层，桌面端从未引用（其 `resolveTransportFactory` 会 `require('react-native')`）
- 依赖：`chess.js`、`sharp`（仅被已删除的图片脚本使用）、`@chessnext/rules-chess`、`@chessnext/engine-process`
- 无用资源与残留：`apps/desktop/public/sounds/move.mp3`（从未被引用）、根目录 `.shot1.png`、`scripts/crop-readme-images.js` 与 `scripts/make-android-foreground.js`（硬编码 `E:/Workspaces/chess` 绝对路径，且输入资源不在仓库内）、`docs/01-tech-selection.md`（已被 02 取代的历史存档）

### Fixed

- **规则库 perft 计数缺陷**（此前被文档化为「已知上游分歧」）：vendor 的 `perft()` 用**伪合法**着法生成后判断 `king_attacked(turn)`，而 `make_move` 已把 `turn` 翻转为对手，于是既计入了「送将」的非法着法、又丢弃了「将军」的合法着法。`XiangqiRules.perft()` 改为遍历已验证的合法着法列表：depth 3 由 79446 修正为 **79666**，与 Pikafish 2026-01-02 逐根着法完全一致；新增 depth 4 对拍（3_290_240，44/44 一致）
- `package.json`：`android` / `windows` / `start` 三条脚本指向 v0.3.0 已删除的 `apps/chessapp`，必然失败 → 删除，并补上 `dev` / `build:frontend` / `probe:moves`
- `scripts/sync-android-engines.ps1`：写入路径仍是已删除的 `apps/chessapp/android/...` → 改指向 `apps/desktop/src-tauri/gen/android/.../jniLibs`
- 幻影依赖：`apps/desktop` 声明了从未 import 的 `@chessnext/engine-process` 与 `@chessnext/persistence` → 移除声明（前者整包删除，后者保留为未接入的接口层）
- **安全**：自签名密钥 `gen/android/chessnext.jks` 连同一组硬编码口令入库 → 从版本控制移除并加入 `.gitignore`，改由 `build.js` 首次构建时生成，凭据支持 `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_PASSWORD` / `ANDROID_KEY_ALIAS` 覆盖
- `scripts/bump-version.mjs`：版本已是目标值时误抛 `Cargo.toml version not found`（用「文本是否变化」代替「正则是否命中」判断）→ 修正
- **`pnpm dev` 在新克隆上必定失败**：`tauri.conf.json` 声明 `bundle.resources: ["../engines"]`，而 Tauri 的构建脚本在资源路径不存在时直接报 `resource path ..\engines doesn't exist`；该目录又是 gitignore 的。现在新增 `scripts/stage-engines.mjs`（`pnpm stage:engines`，`pnpm dev` 与 `build.js` 共用同一实现），并用 `apps/desktop/engines/.keep` 让该目录在克隆后即存在
- 落子音效三处重复（`sound.ts` 内联 base64 + `public/sounds/luozi.mp3` + 仓库根游离副本）→ 删除内联 base64（源文件由 ~9 KB 降至 3.4 KB）与未引用的 `move.mp3`，保留打包资源 + WebAudio 合成兜底
- `scripts/screenshot-window.ps1` 用法注释仍写 `-ProcessName chessapp` → 改为 `chessnext`
- 清理 8 个源文件中指向已删除 `apps/chessapp/src/...` 的历史注释；`runner.ts` 中与现行策略矛盾的「stochastically pick a blunder candidate / Stockfish keeps its own UCI_Elo」注释

### Changed

- **版本 `0.3.3` → `0.4.0-alpha`**（10 处清单 + `Cargo.lock`）
- `GameType` 收窄为 `'xiangqi'`；`RulesAdapter` 抽象与分层保持不变（单成员接缝），便于将来加回第二种棋
- `persistence` 的 `PuzzleProgress` 形状与 UI 本地存储对齐，消除 `state/puzzles.ts` 中的重复接口定义
- 测试改为全象棋并同步既有断言：`session.test.ts` / `assist.test.ts` / `driver.test.ts` / `protocol.test.ts` / `puzzles.test.ts` / `xiangqi.test.ts`（含新增 perft(4)）；**10 套件 89 用例全绿**
- 引擎脚本与文档统一为皮卡鱼单引擎口径（`fetch-engines.ps1` / `sync-android-engines.ps1` / `engine-paths.ts` / `smoke-engines.ts` / `build.js` / `engines.rs`）
- `probe-perft.ts` 重写：新增 `--divide` 逐根着法对拍；新增 `scripts/probe-moves.ts` 用于比对指定局面下的合法着法列表
- 首页改为单一棋种卡片，并加一行小字「实验性版本 · 仅供测试」；窗口标题改为「ChessNext 中国象棋」
- 文档：`README.md` 重写为象棋单棋种版；`licenses/README.md` 去掉 Stockfish / chess.js / Lichess 条目；`docs/02-tauri-migration.md` 重写为架构与决策记录；`docs/puzzles/README.md` 精简为象棋题库调研

### Verified

- `pnpm typecheck` 全仓通过（含 `apps/desktop`）
- `pnpm test`：10 套件 / 89 用例全绿
- `pnpm smoke:engines`：真实 Pikafish 2026-01-02 握手 → EvalFile → 搜索 → 合法着法校验通过
- `pnpm probe:perft 4 --divide`：与引擎逐根着法完全一致

### Known limitations

- 长捉（`perpetual-chase`）仍一律按和棋处理
- 双方均禁（双长将等）按和棋处理，未细分「先提议变着」/ 双负
- 残局 `solution` 仅为参考着法，**不是**单步杀着（早期「基本杀法 · 单步可解」注释与实际数据不符，已更正）
- `persistence` 仍未接入 UI：无对局存储 / 无棋谱导出

## [0.3.3] - 2026-08-26

### Added
- **规则与局限** 章节（`README.md`）：完整说明中国象棋/国际象棋已实现终局判定与已知局限
- 中国象棋 **长将判负**：同一局面第三次出现时回溯两循环，单方着着将军则将军方判负（`perpetual-check`），双方均长将按和棋处理；`GameResult.reason` 新增 `perpetual-check`（`packages/rules-core`）
- 新增 `packages/rules-xiangqi/src/adjudicate.ts`：精确 `isCheck()` 回放的重复裁决器，零误判
- `XiangqiRules` 增量维护 `posFens/posCounts` 与 `occurrencesAfter(uci)` 探针，`undo/reset` 正确回退
- 结果卡与状态栏新增“长将判负”文案（`GameChrome.tsx`）
- 引擎侧 **完整历史透传**：`GameSession` 向 `EngineTurnRunner` / `AssistEngine` / `hint` 发送 `position fen <初始> moves <全程>`，消除引擎“重复盲”
- 皮卡鱼低难度 **防重复护栏**：`choosePikafishMove` 新增 `allowCandidate` 谓词，`candidateGuard()` 基于 `occurrencesAfter ≥2` 过滤二次出现局面，最优着豁免
- 新增 `packages/rules-xiangqi/__tests__/adjudicate.test.ts`（13 用例）：单车长将、镜像、良性重复、undo 回放、分类器边界等
- 自动化发布：`CHANGELOG.md`、`scripts/bump-version.mjs`、`.github/workflows/release.yml`（tag 触发构建并发布 Release）

### Changed
- `README.md`：胜负判定补充长将说明；`对弈功能`后新增 `规则与局限`；`面向开发者` 更新架构与测试统计 `11 套件 94 用例`；`rules-xiangqi` / `engine-uci` / `game-session` 架构描述同步
- `packages/engine-uci`：`choosePikafishMove` 签名扩展，`MoveUci` 类型补全
- `packages/game-session`：`EngineTurnRunner.requestMove` 增加 `guardCandidate`；`AssistEngine.begin` 增加 `moves`；`GameSession` 新增 `startFen` / `engineSearchPosition()` / `candidateGuard()` / `beginAssist()`；`analysis.ts` 透传 `moves`
- `packages/game-session` 测试：新增历史透传与长将端到端用例，`pikafish-strength` 新增护栏用例，`analysis` 新增历史断言

### Fixed
- 中国象棋残局因守方长将被判和而“无法解开”的问题（204 局题库）
- 引擎随机化把本不重复的局面硬拉进重复的问题
- `FEN` 稀疏局面校验（`3K6` 等宽度越界）导致空盘的潜在问题

## [0.3.2] - 2026-08-26

### Added
- 残局训练全量人机对战：以 `Puzzle.fen` 为起点，`XiangqiRules/ChessRules(fen)` + `initialFen` 透传，可选难度（入门 2/业余 6/进阶 10/大师 14/特级 18），切换即重开
- `PuzzlesScreen` 文案“人机对战”；`PuzzleScreen` 重写难度选择与胜负自动标记

### Changed
- 版本 `0.3.0` → `0.3.2`（`package.json` / `apps/desktop/package.json` / `tauri.conf.json` / `Cargo.toml` / 8 个 `packages/*`）
- `Puzzle` 类型说明：`solution` 仅作参考，残局不再做单步强制判定

### Verified
- 204/204 残局：FEN 合法、非终局、执先方均有合法着法，平均 29.3 着（161 局 ≥20 着）

## [0.3.0] - 2026-08-25

### Added
- MIT 开源，`licenses/` 聚合分发说明
- 残局训练：精选 24 局（中象 12：基本杀法→梦入神机→适情雅趣→江湖四大名局；国象 12：Lucena/Philidor/Vancura/Réti + Lichess 高分局）+ 题库 180 局（中象 100：适情雅趣 50+江湖 20+基本杀法 15+梦入神机 15；国象 80：Lichess Puzzle DB `endgame` + `Popularity ≥85`）
- 自然 MultiPV 近分随机、握手硬化（45s 超时 + 快速失败）、红环矢量图标与全量 `images/` 展示
- `docs/puzzles/README.md` 题库调研与校验流程

### Changed
- `pnpm-workspace.yaml` 清理 React Native 残留，`pnpm-lock.yaml` 精简

### Fixed
- 移动端深色状态栏、Android 前景 `viewBox` 安全区、图标自适应等

## [0.2.0] - 2026-08-24

### Added
- Tauri 2 + React 18 + Vite 5 桌面壳（`apps/desktop`），双主题 CSS 变量、DOM 棋盘（`ChessBoardView`/`XiangqiBoardView`）、`GameChrome`、`useGameSession`、`transport/tauri.ts` + `engines.rs` 进程桥
- 引擎：Stockfish 18 / Pikafish 2026-01-02，`UciEngineDriver` FIFO 队列、`profiles.ts` 宿主弱化（`nodes+depth` + `movetime` 帽 + 模糊窗口随机）
- 规则：`rules-core` 统一 `Side w/b`、`rules-chess`/`rules-xiangqi` 封装、`game-session` 状态机/时钟/辅助分析/`suspend`/`resume`
- 10 项打磨：设置持久化、棋盘质感、记谱切换、观战自动/步进等

[Unreleased]: https://github.com/iYeXin/ChessLab/compare/v0.3.3...HEAD
[0.4.0-alpha]: https://github.com/iYeXin/ChessLab/compare/v0.3.3...HEAD
[0.3.3]: https://github.com/iYeXin/ChessLab/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/iYeXin/ChessLab/compare/v0.3.0...v0.3.2
[0.3.0]: https://github.com/iYeXin/ChessLab/releases/tag/v0.3.0
[0.2.0]: https://github.com/iYeXin/ChessLab/compare/v0.2.0...v0.3.0
