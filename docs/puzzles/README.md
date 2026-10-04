# 残局题库调研 · 中国象棋（宁缺毋滥版）

> 状态：**已集成** · 面向 `0.4.0-alpha`（仅中国象棋）
> 原则：高质量 > 数量，来源可追溯、可分发、可被引擎验证

---

## 1. 总览

| 棋种 | 高质量源 | 规模（原始） | 本版采用 | 许可证 | 验证方式 |
|---|---|---|---|---|---|
| 中国象棋 | ①《适情雅趣》551 局（明代古谱） ②《梦入神机》300+ 局 ③ 基本杀法 ~120 局 ④ 江湖残局 ⑤ Endgames_all（小子力残局）— 均来自 `dffge552/xiangqi-pwa-offline` 7300+ 库 | ~7300 | **精选 12 + 题库 100 = 112 局** | MIT（需署名） | `rules-xiangqi` 合法性 + Pikafish 对拍 |

所有残局已转为统一 `Puzzle` 标准格式（见 §3），可直接被 `packages/rules-core` / `engine-uci` / `game-session` 消费。

> 国际象棋题库（Lichess Puzzle DB / 古典定式）已在 `0.4.0-alpha` 中随国象内容一并移除。

---

## 2. 来源详评

### A. `dffge552/xiangqi-pwa-offline` — 唯一主源（MIT）

- **地址**：https://github.com/dffge552/xiangqi-pwa-offline · Live Demo https://android-xiangqi-offline.netlify.app/
- **内容**：`shi-qing-ya-qu.json`（551 局《适情雅趣》古谱全本）、`meng-ru-shen-ji.json`（梦入神机约 152 局）、`basic-checkmates.json`（基本杀法：对面笑 / 海底捞月 / 卧槽马 / 马后炮 / 铁门栓等）、`jianghu-endgames.json`（江湖野局约 300 局）、`endgames_all.json`（小子力残局，附 EGTB 评估）等。
- **质量**：古谱经数百年筛选，江湖局口碑筛选，基本杀法为教学必修；PWA 平台已用 Pikafish WASM 全库验证可走子，非随机生成。
- **格式**：`{fen, name, result, bestMove, timestamp}`，FEN 为 10 行 `w/b` 形式（与本项目 `XiangqiRules` 的 `normalizeFenIn` 兼容，`w` = 红）。`bestMove` 多为空需引擎补全，但 FEN 本身高质量。
- **许可**：MIT，允许商用 / 修改 / 分发，要求保留 copyright。数据 `source` 字段逐条署名。

### B. `kuiba1949/xiangqi-tools` / `xqwizard` EPD 残局库

- **内容**：13 个 EPD 残局库 +《适情雅趣》551 局 FEN。
- **质量**：与 A 同源（xqwizard），多为小子力理论残局，适合「残局定式」训练，艺术性弱于古谱。
- **许可**：BSD-3-Clause。
- **评价**：作为补充，不作为主源。

### C. `chasoft/community-xiangqi-games-database` / `elephantchess.io`

- **内容**：vietcotuong 社区对局库，含 `puzzles` 目录，DPXQ 格式，10 万+ 对局。
- **评价**：以实战对局为主，残局需挖掘，质量参差，暂不采用，留作后续「实战残局挖掘」第二阶段。

**结论**：以 **A 为唯一主源**，551 + 152 + 120 已足以覆盖「基本杀法 → 江湖野局 → 古谱名局」三阶。

---

## 3. 数据格式

见 [`schema.ts`](./schema.ts)（与 `packages/puzzles/src/types.ts` 一致）：

```ts
export interface Puzzle {
  id: string;              // 如 "xiangqi-basic-001" / "xiangqi-large-001"
  gameType: GameType;      // 本版恒为 'xiangqi'
  title: string;
  fen: string;             // 象棋 FEN：10 行，w = 红先
  sideToMove: Side;
  solution: MoveUci[];     // 参考解法（ICCS），非单步强制判定依据
  themes: string[];
  rating: 1 | 2 | 3 | 4 | 5;
  source: string;
  sourceUrl?: string;
  license: string;
  description?: string;
}
```

### 3.1 本版的难度映射

| 难度 | 内容 |
|---|---|
| 1 | 基本杀法（单子力、一看即懂） |
| 2 | 《梦入神机》选局、基本杀法进阶 |
| 3–4 | 《适情雅趣》选局 |
| 5 | 江湖四大名局 |

### 3.2 ⚠️ 关于 `solution`

`solution` 是**采集时的参考着法**，不是标准答案：

- 早期注释称基本杀法为「单步可解 / single move mate」，经 `rules-xiangqi` 实测**不成立**——把 `solution[0]` 走出后并不构成将死，多数题目也根本不存在立即杀着。该注释已更正。
- 本版残局采用**完整人机对战**（以 `Puzzle.fen` 为起点，与引擎下到终局），不做单步强制判定，因此 `solution` 只用于展示与参考。
- 若要把它当作严格答案，需要用引擎对每条解法重新校验并标注步数。

---

## 4. 校验流程

1. **FEN 合法性**：`new XiangqiRules(puzzle.fen)` 能加载；
2. **轮走方一致**：`rules.turn() === puzzle.sideToMove`；
3. **解法可走**：`solution` 中每步在该局面下合法（`rules.clone().move(uci)` 非空）；
4. **非终局**：初始局面 `result()` 为 `null`；
5. **执先方有子可动**：`moves().length > 0`。

以上由 `packages/puzzles/src/validate.ts` 的 `validatePuzzle` 实现，`packages/puzzles/__tests__/puzzles.test.ts` 对全部 112 局执行。

此外，规则的**着法生成**整体与 Pikafish 2026-01-02 做过 perft 对拍（depth 1–4 逐根着法完全一致），见 [`docs/02-tauri-migration.md`](../02-tauri-migration.md) §5.3。

---

## 5. 后续规划

1. **全量拉取 + 清洗脚本**：`scripts/fetch-puzzles.ts` 批量拉取 6 个 JSON，执行 §4 校验，输出 `data/puzzles/raw/`；
2. **解法重校验**：用 Pikafish 逐题求解并标注真实步数与唯一性，区分「杀着题」与「残局对抗题」；
3. **主题标签规范化**：统一 `themes` 词表（杀法 / 古谱名 / 子力类型）；
4. **实战残局挖掘**：从社区对局库中筛出小子力实战残局。

---

## 6. 文件清单

| 文件 | 内容 |
|---|---|
| `docs/puzzles/schema.ts` | `Puzzle` 标准格式（与 `packages/puzzles/src/types.ts` 一致） |
| `docs/puzzles/xiangqi_curated_sample.json` | 调研阶段的 18 局样例（来源与筛选过程的原始留档） |
| `packages/puzzles/src/data/xiangqi.ts` | 精选 12 局的正式数据 |
| `packages/puzzles/src/data/xiangqi_large.ts` | 题库 100 局的正式数据 |
