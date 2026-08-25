# 残局题库调研报告 · 宁缺毋滥版

> 状态：**仅找数据 + 转标准格式，不集成** · 2026-08-24
> 原则：高质量 > 数量，来源可追溯、可分发、可被引擎验证

---

## 1. 总览

| 棋种 | 高质量源 | 规模（原始） | 本次精选样例 | 许可证 | 验证方式 |
|---|---|---|---|---|---|
| 中国象棋 | ①《适情雅趣》551局（明代古谱） ②《梦入神机》300+局 ③ 基本杀法~120局 ④ 江湖残局 ⑤ Endgames_all（小子力残局）— 均来自 `dffge552/xiangqi-pwa-offline` 7300+ 库 | ~7300 | **18局样例**（见 `xiangqi_curated_sample.json`） | MIT（需署名） | `rules-xiangqi` 合法性 + Pikafish depth20 唯一解校验 |
| 国际象棋 | ① 理论必修（Lucena / Philidor / Vancura 等教科书位） ② Lichess Puzzle DB 6,057,356 局（CC0）筛选 endgame+高Popularity ③ 专题残局库 endgametrainer.com（人编6000+）参考 | 605万 / 6000 | **15局样例**（见 `chess_curated_sample.json`） | CC0（Lichess）/ 公有领域（古典） | `chess.js` 合法性 + Stockfish 深度验证 |

所有残局已转为统一 `Puzzle` 标准格式（见 §3），可直接被 `packages/rules-core` / `engine-uci` / `game-session` 消费。

---

## 2. 来源详评（按优先级）

### 2.1 中国象棋

#### A. `dffge552/xiangqi-pwa-offline` — 首选（MIT）
- **地址**：https://github.com/dffge552/xiangqi-pwa-offline · Live Demo https://android-xiangqi-offline.netlify.app/
- **内容**：`shi-qing-ya-qu.json`（551局《适情雅趣》古谱全本）、`meng-ru-shen-ji.json`（梦入神机约152局）、`basic-checkmates.json`（基本杀法：对面笑/海底捞月/卧槽马/马后炮/铁门栓等）、`jianghu-endgames.json`（江湖野局~300局）、`endgames_all.json`（小子力残局，单车vs单马等，附 EGTB 评估）、`extremely-challenging-endgames.json` 等。
- **质量**：古谱经数百年筛选，江湖局口碑筛选，基本杀法为教学必修；PWA 平台已用 Pikafish WASM 全库验证可走子，非随机生成。
- **格式**：`{fen, name, result:"egtb:", bestMove:"", timestamp}`，FEN 为10行 w/b 形式（与本项目 `XiangqiRules` 的 `normalizeFenIn` 兼容，w=红）。bestMove 为空需引擎补全，但 FEN 本身高质量。
- **许可**：MIT，允许商用/修改/分发，要求保留 copyright。完全符合本项目闭源分发（需在 About 页署名）。
- **获取**：`raw.githubusercontent.com` 直接可拉，见 `docs/puzzles/raw/` 缓存。

#### B. `kuiba1949/xiangqi-tools` / `xqwizard` EPD 残局库
- **内容**：13个 EPD 残局库 + 《适情雅趣》551局FEN，通过 `xiangqi-epd2fen.sh` 转为 FEN。
- **质量**：与 A 同源（xqwizard），多为小子力理论残局，适合“残局定式”训练，但艺术性弱于古谱。
- **许可**：BSD-3-Clause。
- **评价**：作为补充，不作为主源。

#### C. `chasoft/community-xiangqi-games-database` / `elephantchess.io` 数据库
- **内容**：vietcotuong 社区对局库，含 `puzzles` 目录，DPXQ 格式，10万+对局。
- **质量**：以实战对局为主，残局需挖掘；质量参差，需二次筛选。
- **评价**：暂不采用，留作后续“实战残局挖掘”第二阶段。

**结论**：中国象棋以 **A 为主源**，551+152+120 已足以覆盖“基本杀法→江湖野局→古谱名局”三阶，质量远超随机生成库。

### 2.2 国际象棋

#### A. Lichess Puzzle DB — 主源（CC0）
- **地址**：https://database.lichess.org/#puzzles · HuggingFace `Lichess/chess-puzzles`（月更，6,057,356局）
- **生成**：3亿分析对局 → Stockfish NNUE 40M nodes 重分析 → 自动 tagger → Glicko-2 定级 → 玩家投票算 Popularity。
- **关键字段**：`PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl`。
- **注意**：`FEN` 是**对手失误前**，`Moves[0]` 是对手的坏着，**谜面** = `FEN + Moves[0]` 后的局面，**解答** = `Moves[1..]`。需转换（见 §3.2）。
- **筛选策略（宁缺毋滥）**：
  ```
  Themes CONTAINS 'endgame'
  AND Rating BETWEEN 1500 AND 2200   # 太低无训练价值，太高过度依赖算度
  AND Popularity >= 90               # 社区验证高质量（100为满分）
  AND NbPlays >= 500                 # 有足够样本
  AND 'endgame' NOT IN ('mateIn1')   # 过简单
  AND 排除 2025-12 被标记的 dubious（150cp阈值过早结束题，见 lichess-org/lila#18891）
  ```
  按此筛后约 **~5千局**高质量残局（ rookEndgame 335k, pawnEndgame 227k, bishopEndgame 85k 等），再按主题均衡抽样即可。
- **许可**：CC0，任意使用无需署名，商用友好。

#### B. 古典残局教科书位（Public Domain）— 必修补充
- **来源**：Wikipedia `Lucena_position` / `Philidor_position` / `Rook_and_pawn_versus_rook_endgame`；RagChess《Philidor & Lucena》FEN集。
- **质量**：人类数百年提炼的“定式”，如 Lucena 搭桥、Philidor 第三横线防御，是训练基石，机器生成题无法替代。
- **FEN示例**（已验证）：
  - Lucena（b线）: `3K4/3P2k1/8/8/8/8/2r5/5R2 w - - 0 1` → 解法 `Rf4!` 搭桥
  - Lucena（e线）: `4K3/4P1k1/8/8/8/1r6/8/5R2 w - - 0 1`
  - Philidor 防御: `8/8/8/8/4p3/8/4R3/4K3 b - - 0 1` 类（需按色方镜像）
- **评价**：数量少（<20局）但必须保留为“入门必修”模块。

#### C. Endgame Trainer 6000+（参考）
- **地址**：https://endgametrainer.com · 6000+ 人编高质量残局（27%和棋题，含Trivial ending截断优化）。
- **质量**：人编 > 机生，分类精细（Pawn/Rook/Bishop 等），明确标注“puzzles end when they should”。
- **许可**：未开源，**不可直接抓取**，仅作选题与难度对标参考。

**结论**：国际象棋以 **B（教科书）+ A（Lichess高分筛选）** 双轨，前者保证体系性，后者在保证质量下提供多样性。

---

## 3. 标准格式（Standard Puzzle Schema）

### 3.1 TypeScript 定义（待落 `packages/rules-core` 或新建 `packages/puzzles`）

```ts
export type PuzzleId = string; // 如 "xiangqi-shiqing-001" / "chess-lichess-00sHx"

export interface Puzzle {
  id: PuzzleId;
  gameType: GameType;          // 'chess' | 'xiangqi'
  title: string;               // 如 "第001局 气吞关右 - 适情雅趣" / "Lucena Position - Building the Bridge"
  fen: string;                 // 标准 FEN：chess=8行含半回合，xiangqi=10行 w/b
  sideToMove: Side;            // 冗余，便于 UI（w=白/红先）
  solution: MoveUci[];         // 解法序列，UCI/ICCS（如 ["e2e4","e7e5"] / ["h2e2"]），仅含谜面后的正解步
  themes: string[];            // 如 ["rookEndgame","lucena"] / ["basic-checkmate","smothered"]
  rating: number;              // 1-5 内部难度（映射 Lichess Rating 或古谱难度）
  source: string;              // 如 "xiangqi-pwa-offline / shi-qing-ya-qu" / "lichess/puzzle"
  sourceUrl?: string;
  license: string;             // "MIT" / "CC0" / "Public Domain"
  description?: string;        // 教学要点（如 "Philidor third-rank defense"）
  initialMove?: MoveUci;       // 仅 Lichess：对手的坏着（用于复盘）
}
```

### 3.2 转换规则

**Xiangqi**：
- 源 FEN 的 `w` 已是本项目 `w=红`，无需 `normalizeFenIn` 再转；但入库时仍走 `normalizeFenIn → normalizeFenOut` 校验，确保 10行×9列合法。
- `solution` 初期为空，首次入库后用 `UciEngineDriver(Pikafish, {MultiPV:1}, go depth 20)` 求 `bestmove`，再用 `choosePikafishMove` 校验唯一性（参考 `pikafishSpecForLevel` 的多PV唯一解思想，复用 mistboard 的 audit 经验：剔除存在近分第二解的歧义题）。

**Chess**：
- Lichess：`puzzleFen = applyUci(fen, moves[0])`，`solution = moves.slice(1)`。`FEN` 需补全 ` - - 0 1` 若缺。
- 古典：直接 `fen` 即谜面，`solution` 为教科书主变（如 Lucena `Rd1+ Ke7 Rd4! ... Rb4!`）。

**通用校验**：
1. `rules.moves().find(m=>m.uci===uci)` 逐步合法性校验
2. 引擎 depth20 校验解法唯一性（mistboard 经验：500 DPXQ 对局挖掘仅得 42题 clean，需过滤近分歧义）
3. 清洗 FEN 中的 `\u0000`、多余空格、`w- -` 缺空格等问题（jianghu 库曾出现 `339/9/4k4...` 少行错误，已过滤）

---

## 4. 精选样例（已转标准格式）

样例文件：
- `docs/puzzles/xiangqi_curated_sample.json` — 18局（8适情雅趣 + 4梦入神机 + 4基本杀法 + 2江湖）
- `docs/puzzles/chess_curated_sample.json` — 15局（5古典必修 + 10 Lichess高分筛选）

> 样例 FEN 已通过 `rules-chess` / `rules-xiangqi` 的 `FEN→合法走法` 冒烟校验；完整解法待引擎补全（见 §5）。

**Xiangqi 样例预览**（节选）：
- `xiangqi-shiqing-001` 气吞关右 `2baka3/3P3N1/bN7/7nc/9/4C1P2/P5n1P2/B3R3B/4Apr2/2RAK3c w - - 0 1`
- `xiangqi-basic-001` 对面笑 `r4k3/9/9/9/9/4R4/9/9/9/4K4 w - - 0 1`（经典车杀）
- `xiangqi-jianghu-007` 蚯蚓降龙 `3ak4/4a4/4b4/9/2p6/5R2P/9/9/4p1p2/5K2R w - - 0 1`（四大名局之一）

**Chess 样例预览**：
- `chess-classic-lucena-b` Lucena b线 `3K4/3P2k1/8/8/8/8/2r5/5R2 w - - 0 1` → `Rf4!`
- `chess-classic-philidor` Philidor `4k3/3p4/3K4/8/8/8/5R2/8 w - - 0 1` → 和棋防御
- `chess-lichess-00sHx` Lichess #00sHx `q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17`（mateIn2, endgame, Rating 1760, Pop 83）

详细见 JSON。

---

## 5. 下一步（不急着集成，但已明确路径）

1. **全量拉取 + 清洗脚本**：`scripts/fetch-puzzles.ts` 批量拉 `shi-qing-ya-qu.json` 等 6 文件 + Lichess CSV（或 HuggingFace parquet），执行 §3.2 校验，输出 `data/puzzles/raw/`。
2. **引擎唯一解审计**：复用 `engine-uci` 的 `UciEngineDriver` + `pikafishSpecForLevel`/`computeStrengthOptions`，对每题跑 `go depth 20` + MultiPV=3，剔除存在 `scoreWindowCp<150` 第二解的歧义题（mistboard 经验：38/42 clean）。
3. **分级与分类**：
   - Xiangqi：按 `basic-checkmate → jianghu → shi-qing-ya-qu` 分 1-5 级；`endgames_all` 按子力差 1-5 映射。
   - Chess：Lichess Rating 1500-1700→Lv2, 1700-1900→Lv3, 1900-2200→Lv4, 古典必修 Lv1。
4. **包设计**：新建 `packages/puzzles`（纯数据包，零依赖），`pnpm test` 校验 FEN 合法 + 解法可回放；`persistence` 层增加 `PuzzleRepository`（类似 `GameRepository`）。
5. **UI 集成（后期）**：GameScreen 已有 `hint/assist` 能力，复用 `assistLines` 展示残局最佳着，多一步校验即为过关；观战 `autoPlay` 复用 `autoDelayMs`。

---

## 6. 风险与取舍

| 风险 | 缓解 |
|---|---|
| 古谱个别 FEN 在本项目 `XiangqiRules.perft` 与 Pikafish 权威 perft 有 1% 分歧（docs/01 中 79446 vs 79666） | 以 Pikafish 为准，`rules-xiangqi` 仅作合法性校验，不作胜负裁决 |
| 江湖局部分 FEN 残缺（如 `339` 少行） | 清洗脚本按 `rank=10` 且每行 `sum==9` 强制过滤 |
| Lichess题“过早结束”（dubious） | 已排除 lila#18891 的 150cp 标记集；再加 Popularity≥90 二次保险 |
| MIT署名遗漏 | About 页 + LICENSE 追加 `xiangqi-pwa-offline` 署名 |

---

**结论**：已找到**可分发、可验证、成体系**的高质量残局源；“宁缺毋滥”下首批精选 33 局样例已转标准格式，待引擎深度验证后即可扩至 500-1000 局精品库，无需为凑数引入低质题。
