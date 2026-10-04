import { describe, expect, it } from 'vitest';
import { isOnnxOnly, resolveSideModes } from '../engine-mode-plan';

describe('resolveSideModes', () => {
  it('uses the single engine mode for both sides outside 观战', () => {
    // Regression: 人机 with mode 3 must run ONNX for the engine side. Previously
    // the per-side 观战 defaults (1) won, so Pikafish was spawned instead.
    expect(resolveSideModes(3)).toEqual({ w: 3, b: 3 });
    expect(resolveSideModes(2)).toEqual({ w: 2, b: 2 });
    expect(resolveSideModes(1)).toEqual({ w: 1, b: 1 });
  });

  it('lets 观战 mix modes per side', () => {
    expect(resolveSideModes(1, { white: 1, black: 3 })).toEqual({ w: 1, b: 3 });
    expect(resolveSideModes(3, { white: 2, black: 1 })).toEqual({ w: 2, b: 1 });
  });

  it('ignores the single mode when watchModes is given', () => {
    // Even if the global mode is 3, 观战 follows the per-side plan.
    expect(resolveSideModes(3, { white: 1, black: 2 })).toEqual({ w: 1, b: 2 });
  });
});

describe('isOnnxOnly', () => {
  it('is true only when every side is ONNX', () => {
    expect(isOnnxOnly([3])).toBe(true);
    expect(isOnnxOnly([3, 3])).toBe(true);
    expect(isOnnxOnly([3, 1])).toBe(false);
    expect(isOnnxOnly([1])).toBe(false);
    expect(isOnnxOnly([2, 3])).toBe(false);
  });

  it('treats an empty plan as "no engine sides"', () => {
    expect(isOnnxOnly([])).toBe(false);
  });
});
