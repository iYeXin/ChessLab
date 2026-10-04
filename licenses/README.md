# Third-party licenses carried with distributions

本目录存放**随分发包附带**的第三方许可证文本。应用本体许可证见仓库根目录 [`LICENSE`](../LICENSE)（MIT）。

## 分发合规映射

| 组件 | 许可证 | 文本位置 | 源码义务 |
|---|---|---|---|
| 应用本体（`apps/`、`packages/`、`scripts/`、`build.js`、`docs/`） | MIT | 根目录 `LICENSE` | 无（MIT 无源码提供义务，但我们公开仓库） |
| Pikafish 2026-01-02（独立进程，未修改官方二进制） | GPL-3.0 | [`GPL-3.0.txt`](./GPL-3.0.txt) | 官方源码：https://github.com/official-pikafish/Pikafish |
| xiangqi.js（vendored 规则内核） | BSD-2 | [`BSD-2-xiangqi.js.txt`](./BSD-2-xiangqi.js.txt)（同 `packages/rules-xiangqi/vendor/LICENSE`） | 无（本项目对其有少量补丁：显式 ESM 命名导出） |
| 残局题库（象棋，来自 xiangqi-pwa-offline） | MIT | 上游：https://github.com/dffge552/xiangqi-pwa-offline （MIT） | 无；已在每条数据的 `source` 字段及 README 致谢 |

## 合规边界（范畴界定）

- **MIT 的适用范围**：仅覆盖本项目作者编写的代码与文档。不延伸至上述第三方组件。
- **GPL 引擎的聚合模型**：Pikafish 以**未修改的官方二进制 + 独立 OS 进程 + stdio 文本协议**方式与应用交互，构成著作权法意义上的聚合（aggregate）而非衍生作品。GPL 仅约束引擎自身；分发聚合产物时须：① 附带 GPL-3.0 文本（本目录）；② 提供引擎对应源码链接（上表）。应用代码（MIT）不受 GPL 传染。
- **BSD-2 / MIT 组件**：保留各自版权与许可声明即可，与 MIT 本体兼容。
