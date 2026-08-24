# 棋弈 ChessLab

> 单机双棋种对弈 · 国际象棋 + 中国象棋 · 离线满血引擎

**棋弈**是一款离线单机对弈应用，同时内置两套顶级引擎：国际象棋 **Stockfish 18**，中国象棋 **Pikafish 2026-01-02（皮卡鱼）**。无需联网，开箱即下，支持人机、人人、观战（双机）三种玩法，适配 **Windows** 与 **Android**。

---

## 下载安装

### Windows
- 安装包：`apps/desktop/src-tauri/target/release/bundle/nsis/ChessLab_0.1.0_x64-setup.exe`（约 127 MB，含双引擎）
- 双击安装即可。安装包未使用商业证书签名，首次运行 Windows 可能提示“未知发布者”，选择“仍要运行”。

### Android
- 安装包：`apps/desktop/src-tauri/gen/android/app/build/outputs/apk/universal/release/ChessLab_0.1.0_universal-signed.apk`（约 199 MB，universal 全架构）
- 自签名证书：`gen/android/chesslab.jks`（`alias chesslab` / `storepass/keypass chesslab123`），`apksigner v2/v3` 已校验通过
- 允许安装未知来源应用后直接安装。

> 引擎体积占大头（Stockfish 114 MB + Pikafish NNUE 53 MB），属正常现象。AAB 位于同目录 `bundle/universalRelease/`。

---

## 玩法一览

| 模式 | 说明 |
|---|---|
| **人机** | 选择执子颜色与难度（入门/业余/进阶/大师/特级），与引擎对弈 |
| **双人** | 同机双人轮流落子，无引擎 |
| **观战** | 双机对弈，分别设置红/白与黑方棋力；`自动` 按延迟自动走子，`手动步进` 每点“下一步”走一子 |

- **难度** 对应引擎强度 1–20 级（`入门 2 / 业余 6 / 进阶 10 / 大师 14 / 特级 18`），Pikafish 采用 `nodes + 深度` 主限 + `MultiPV` 随机选着 的宿主弱化，跨设备稳定。
- **悔棋 / 认输 / 提示 / 辅助** 均在对局页底部直接操作。
- **暂停 / 继续** 仅观战自动模式可见；手动步进下“下一步”待引擎思考时自动禁用。

---

## 对局内功能

- **合法落点**：选中己方棋子后高亮可落点（可在设置中关闭）。
- **上一步高亮**：起点淡黄、落点深黄；对方落点以环形描边突出。
- **提示**：点击“提示”高亮最佳着法，再点目标点即可直接落子。
- **辅助分析**：开启后常驻顶部，显示 `MultiPV` 前 3 变着与分数；观战模式下自动开启并常驻、更新时不抖动。
- **着法记录**：默认“对局中隐藏，结束后查看”，结束后在结果卡片或棋盘底部以独立弹窗查看完整记录，避免挤占棋盘。
- **中国象棋记谱**：可在设置中切换 `坐标（h2e2）` / `传统（炮二平五、兵五进一）`，传统记谱自动处理同列多子 `前/后/中` 与进退平。
- **翻转对方棋子**：开启后对方棋子 180° 朝向对面，更贴近实物棋盘。

---

## 棋盘与视觉

- **国际象棋**：经典 / 精致 两档。精致档为胡桃木斜向渐变边框、内阴影、坐标淡金、棋子微立体阴影。
- **中国象棋**：平板 / 仿真 两档；仿真为细腻木纹底 + 棋子结构化立体（顶部高光、边缘厚度、投影），棋盘本体保持平板不做渐变。河界“楚河 漢界”采用典雅衬线。
- **棋子字体**：
  - 默认：`Noto Sans SC / 黑体`，清晰。
  - 隶书：内嵌 `ChessLishu.woff2`（Windows `LiSu` 子集，仅 18 字 3.5 KB），笔画放大 `0.62×`，无需联网。
- **滚动条**：全应用隐藏原生滚动条（`scrollbar-width:none`），保留触控/滚轮滚动，界面更干净。

---

## 设置

首页“设置”进入，分为四组：

- **对局显示**：显示可走位置、翻转对方棋子、着法记录模式
- **国际象棋**：棋盘质感
- **中国象棋**：棋子字体、棋盘/棋子质感、记谱方式
- **观战设置**：自动步进延迟（无/0.5/0.8/1.2/2 秒）

所有设置 `localStorage` 自动保存。

---

## 引擎与离线

- **Stockfish 18**（国际象棋）与 **Pikafish 2026-01-02** 随包离线运行，通过 Tauri `spawn` + 流式 `stdout` 桥接，无需下载。
- Pikafish 的 `pikafish.nnue` 随包 `EvalFile` 自动指向，Windows 为 `resources/engines`，Android 为 `jniLibs/arm64-v8a/libpikafish_nnue.so`。
- 诊断页可一键检测：`spawn → uci 握手 → 选项 → NNUE → 搜索`，展示引擎名、选项数与测试着法耗时。

---

## 使用小技巧

- 象棋点击己子出现圆点即为合法点；再点目标点走子，点同一子取消。
- 提示高亮为蓝色，起点与落点同显；此时直接点落点即走提示着。
- 象棋红先/黑后、国际象棋白先/黑后在对应棋种的配置页选择。
- 观战时可在对局内随时“暂停/继续”，配合延迟适合讲解与演示。

---

## 技术栈（面向开发者）

- **客户端**：Tauri 2 + React 18 + Vite + TypeScript（`apps/desktop`），窗口 `480×860`，WebView2 / System WebView
- **纯 TS 内核**：`packages/rules-core`/`rules-chess`/`rules-xiangqi`/`engine-uci`/`game-session`/`persistence`（`pnpm test` 8/8, 63/63）
- **引擎桥**：`apps/desktop/src-tauri/src/engines.rs`（`spawn/write/stop` + `engine://line/<id>`），`src-ui/transport/tauri.ts` + `state/engines.ts`
- **文档**：迁移决策见 `docs/02-tauri-migration.md`，历史选型见 `docs/01-tech-selection.md`

常用命令：

```powershell
pnpm install
pnpm test
pnpm --filter desktop dev          # 前端 1420 + Rust
pnpm --filter desktop tauri build  # Windows NSIS
pnpm --filter desktop tauri android build  # Android APK/AAB（需 ANDROID_HOME/NDK，自签名见上）
```
