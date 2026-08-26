# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/lang/zh-CN/).

## [Unreleased]

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
[0.3.3]: https://github.com/iYeXin/ChessLab/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/iYeXin/ChessLab/compare/v0.3.0...v0.3.2
[0.3.0]: https://github.com/iYeXin/ChessLab/releases/tag/v0.3.0
[0.2.0]: https://github.com/iYeXin/ChessLab/compare/v0.2.0...v0.3.0
