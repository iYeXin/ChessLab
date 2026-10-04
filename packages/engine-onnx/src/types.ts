/**
 * Shared shapes for the ONNX tier engine (T1–T5).
 *
 * The research model contract (see ChineseChess `docs/档位模型接入文档.md`):
 *   input  `planes` [batch, 17, 10, 9]  float32
 *   output `policy` [batch, 8100]       float32 — RAW logits, no legal mask
 *   output `value`  [batch, 3]          float32 — (win, draw, loss), side-to-move POV
 *
 * The graph deliberately does NOT do legal masking, check/mate detection or
 * repetition handling — all of that stays in the app (we reuse `rules-xiangqi`
 * for it, which is verified against Pikafish perft).
 *
 * This module is intentionally free of any `onnxruntime` import: the runtime is
 * injected as an `OnnxSession`, which keeps the encoding/inference policy
 * unit-testable on Node.
 */

/** Board squares (9 files x 10 ranks). */
export const NSQ = 90;
/** Policy head size: from * 90 + to. */
export const NMOVE = 8100;
/** Input plane count. */
export const PLANES = 17;

/** Model outputs, already unwrapped from the runtime's tensor type. */
export interface OnnxOutputs {
  /** Float32Array(NMOVE) — raw policy logits. */
  policy: Float32Array;
  /** Float32Array(3) — (win, draw, loss) logits, side-to-move POV. */
  value: Float32Array;
}

/** Minimal surface the runner needs from a loaded ONNX model. */
export interface OnnxSession {
  /** Which execution provider actually got used ("webgpu" | "wasm" | ...). */
  readonly backend: string;
  run(planes: Float32Array): Promise<OnnxOutputs>;
  dispose(): void;
}

export interface PositionValue {
  win: number;
  draw: number;
  loss: number;
}

/** One ranked move candidate. */
export interface RankedMove {
  /** Move index in ORIGINAL board view. */
  move: number;
  /** ICCS string, e.g. "h2e2". */
  iccs: string;
  /** Probability under the temperature-scaled, legal-masked policy. */
  p: number;
}

export interface InferenceResult {
  /** Best move index in ORIGINAL board view, or -1 when no legal move exists. */
  bestMove: number;
  /** Up to 8 candidates, descending probability, ORIGINAL board view. */
  top: RankedMove[];
  /** Every legal move ranked (used by the mate guard). */
  ranked: RankedMove[];
  value: PositionValue;
  backend: string;
}
