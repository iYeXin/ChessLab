# ChessLab

双棋种单机对弈软件 —— 国际象棋（Stockfish 18）+ 中国象棋（Pikafish）。
React Native monorepo，目标平台 **Android + Windows**。

> 技术选型理由、调研结论与已知债务见 [docs/01-tech-selection.md](docs/01-tech-selection.md)。

## 工程结构

```
packages/
  rules-core        规则层共享抽象：RulesAdapter / Side('w'|'b') / UCI 坐标着法
  rules-chess       国际象棋规则（chess.js 封装）
  rules-xiangqi     中国象棋规则（vendor xiangqi.js + 自维护补丁）
  engine-uci        UCI 协议解析/构造、UciEngineDriver（握手·选项·串行搜索）
  engine-process    EngineTransport 适配器：Node | RN原生桥 (Android/Windows) | WASM(未来)
  game-session      对局编排：GameSession 状态机、GameClock、EngineTurnRunner
  persistence       GameRepository 接口 + memory/node-file 实现
apps/chessapp        RN 应用壳
  android/          含 ChessEnginesModule.kt（ProcessBuilder 引擎桥）
  windows/          RNW 工程 + ChessEnginesModule.h（CreateProcess 引擎桥）
scripts/            引擎下载/jniLibs 同步/冒烟测试/perft 探针
third_party/        引擎二进制缓存（不入库）
docs/               决策文档
```

分层依赖单向向下，UI 之下全部是零 React 依赖的纯 TS 包。

## 常用命令

```powershell
pnpm install            # 安装依赖（workspace）
pnpm test               # 全部单元测试（48 个）
pnpm typecheck          # tsc -b
pnpm fetch:engines      # 下载官方引擎到 third_party/engines（含解压/清单）
pnpm smoke:engines      # 用真实二进制跑 UCI 握手+搜索冒烟测试
pnpm sync:jniLibs       # 把 Android arm64 引擎拷入 jniLibs（lib*.so 形式）
pnpm tsx scripts/probe-perft.ts   # 引擎 perft 权威值探针（sf|pf|省略=全部）

pnpm start              # Metro dev server
pnpm android            # 构建并安装 Android 应用
pnpm windows            # 构建 Windows 应用（需 VS2026 >=18.6）
```

## 平台注意事项（踩坑记录）

- **Android 引擎执行**：targetSdk>=29 禁止 exec 应用数据目录文件；本工程把引擎以
  `lib<name>.so` 放进 jniLibs 并开启 `useLegacyPackaging`，运行时从
  `nativeLibraryDir` 启动。Pikafish 的 NNUE 同法打包为 `libpikafish_nnue.so`，
  通过 `EvalFile` 指向该绝对路径。
- **pnpm 兼容**：`@react-native/gradle-plugin`、`@react-native-windows/cli`、
  `@react-native/codegen` 必须显式声明为 app 的依赖（库会用相对路径或插件扫描
  找它们，pnpm 隔离布局下不提升即失败）；gradle-plugin 带 foojay 0.5.0→1.0.0 补丁
  （`patches/`，RN 官方 bug #56287）；另在 `pnpm-workspace.yaml` 提升 `@babel/*`
  以兼容 codegen 的幽灵依赖。
- **JDK**：Gradle 9 无法运行在 Java 25 上，`android/gradle.properties` 已固定
  Temurin 21（`org.gradle.java.home`）。
- **Windows**：
  - RNW 0.84 要求 VS2026 ≥18.6 与 PowerShell 7 (`pwsh`)；本机 VS 通道尚未推到
    18.6 时，可绕过 CLI 版本门禁直接 MSBuild（本仓库已验证可编过 exe）：

    ```powershell
    msbuild apps\chessapp\windows\chessapp.sln -t:Restore,Build `
      -p:Configuration=Debug -p:Platform=x64 `
      -p:WindowsTargetPlatformVersion=10.0.26100.0 -p:TargetPlatformVersion=10.0.26100.0
    ```

    （第二个属性覆盖 `chessapp.Package.wapproj` 的默认 SDK 22621——本机只装了
    26100；装了 22621 SDK 则无需覆盖。）
  - 原生模块为 attributed TurboModule：见
    `apps/chessapp/windows/chessapp/ChessEnginesModule.h`，由 `chessapp.cpp`
    include 后经 `AddAttributedModules` 注册，无需 codegen。

## 后端验证状态

| 验证项 | 结果 |
|---|---|
| 单元测试（协议/驱动/两棋种规则/会话/持久化/辅助分析） | ✅ 55/55 |
| typecheck（strict, noUncheckedIndexedAccess） | ✅ |
| Stockfish 18 真实握手+搜索（一步杀 h1h8） | ✅ |
| Pikafish 真实握手+EvalFile+开局搜索（h2e2 中炮） | ✅ |
| 象棋 perft d1/d2 与 Pikafish 一致（44/1920） | ✅（d3 有上游分歧，已记录）|
| Windows C++ 模块编译 + .msix 打包 | ✅ MSBuild x64 Debug 全绿 |

## 辅助着棋（后端已就绪）

三层能力，UI 阶段按需接入：

| 层级 | 能力 | 接口 |
|---|---|---|
| L1 提示 | 一次性最佳着法建议 | `session.hint()` → `LegalMove`（引擎实例复用，不逐次冷启动） |
| L2 常驻辅助 | 开关打开后持续 infinite 搜索，输出 top-N 候选 + cp/mate 评估 | `session.enableAssist({multiPv})` / `disableAssist()`；订阅 `assist` 事件拿 `AssistLine[]` |
| L3 失误反馈 | 相邻两次评估落差 = 走子质量 | 由 L2 数据推导，纯前端计算 |

关键设计：辅助引擎是**独立于对手引擎的进程**（UCI 单进程仅允许一个活动搜索；
且提示强度恒定满级、不受对手难度影响）。局面变化（含悔棋）与终局由
`GameSession` 自动驱动启停，UI 只消费事件。
