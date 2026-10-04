import React, { useEffect, useMemo } from 'react';
import {
  PIKAFISH_PROFILE,
  PIKAFISH_STRENGTH_OPTIONS,
  SEARCH_BUDGET_FIELDS,
  engineOptionPresetForLevel,
  type StrengthOptionSpec,
} from '@chessnext/engine-uci';
import { TEMPERATURE_PRESETS, TIER_IDS, type TierId } from '@chessnext/engine-onnx';
import { DIFFICULTY_IDS, difficultyLabel, levelForDifficulty, type Difficulty } from '../state/difficulty';
import { preloadTierSession } from '../state/onnx';
import {
  ENGINE_MODE_LABELS,
  engineModeFor,
  targetLabel,
  useSettings,
  type EngineMode,
  type EngineModeTarget,
  type Mode2LevelOverride,
  type OnnxTemperatureId,
} from '../state/settings';

/**
 * Tester-mode difficulty modal.
 *
 * Shown instead of the inline difficulty pickers whenever 测试人员模式 is on.
 * It is the single place where the engine mode (1/2/3) and its settings are
 * chosen, because this build carries several experimental difficulty paths.
 */

const C = {
  overlay: 'rgba(20,15,8,0.55)',
  surface: '#FBF7EE',
  surfaceAlt: '#EFE9DE',
  border: '#E4DCCD',
  borderStrong: '#D8CDB8',
  text: '#2A251D',
  textSec: '#5C5343',
  muted: '#8A8070',
  accent: '#A63A2B',
  accentSoft: '#E9DCC4',
};

export interface DifficultyModalProps {
  visible: boolean;
  /** What is being chosen, e.g. "难度" or "黑方棋力". */
  label: string;
  /** Which setting the mode buttons edit (观战模式下按方分别设置). */
  modeTarget?: EngineModeTarget;
  difficulty: Difficulty;
  onDifficulty(d: Difficulty): void;
  onClose(): void;
}

export function DifficultyModal(props: DifficultyModalProps) {
  const { settings, update, setSettings, setMode2Override } = useSettings();
  const target: EngineModeTarget = props.modeTarget ?? 'global';
  const mode = engineModeFor(settings, target);
  const level = levelForDifficulty(props.difficulty);

  // Warm the ONNX session as soon as the tier is picked, so the first move in
  // a game does not pay the model-load cost.
  const onnxTier = props.difficulty as TierId;
  useEffect(() => {
    if (props.visible && mode === 3) preloadTierSession(onnxTier);
  }, [props.visible, mode, onnxTier]);

  const setMode = (m: EngineMode) => {
    setSettings(prev => {
      if (target === 'white') return { ...prev, engineModeWhite: m };
      if (target === 'black') return { ...prev, engineModeBlack: m };
      return { ...prev, engineMode: m };
    });
  };

  if (!props.visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        backgroundColor: C.overlay,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--sp-l)',
      }}
      onClick={props.onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: C.surface,
          borderRadius: 14,
          boxShadow: '0 12px 40px rgba(20,15,8,0.35)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, backgroundColor: '#F7F3EA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{props.label}</span>
          <span style={{ fontSize: 10, color: C.accent, border: `1px solid ${C.accentSoft}`, borderRadius: 999, padding: '2px 8px' }}>
            测试人员模式
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* engine mode */}
          <Section title={target === 'global' ? '棋力方案' : `棋力方案（${targetLabel(target)}）`}>
            <div style={{ display: 'flex', gap: 8 }}>
              {([1, 2, 3] as EngineMode[]).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1,
                    padding: '9px 0',
                    borderRadius: 10,
                    border: `1px solid ${mode === m ? C.accent : C.borderStrong}`,
                    backgroundColor: mode === m ? C.accentSoft : C.surface,
                    color: mode === m ? '#4C3418' : C.textSec,
                    fontSize: 12,
                    fontWeight: mode === m ? 800 : 500,
                  }}
                >
                  模式 {m}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>
              {ENGINE_MODE_LABELS[mode].title} —— {ENGINE_MODE_LABELS[mode].hint}
            </div>
          </Section>

          {/* 档位：模式 3 由 T1–T5 列表直接选择，因此这里不重复 */}
          {mode === 3 ? null : (
            <Section title="档位">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DIFFICULTY_IDS.map(d => (
                  <Choice
                    key={d}
                    label={difficultyLabel(d)}
                    active={props.difficulty === d}
                    onClick={() => props.onDifficulty(d)}
                  />
                ))}
              </div>
            </Section>
          )}

          {mode === 2 ? (
            <Mode2Panel
              level={level}
              override={settings.mode2[String(level)]}
              onChange={value => setMode2Override(level, value)}
            />
          ) : null}

          {mode === 3 ? (
            <Mode3Panel
              difficulty={props.difficulty}
              onDifficulty={props.onDifficulty}
              temperature={settings.onnxTemperature}
              mateGuard={settings.onnxMateGuard}
              onTemperature={v => update('onnxTemperature', v)}
              onMateGuard={v => update('onnxMateGuard', v)}
            />
          ) : null}
        </div>

        <div style={{ padding: '10px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={props.onClose}
            style={{ padding: '9px 26px', borderRadius: 999, backgroundColor: '#33291C', color: '#F5EDDD', fontSize: 13, fontWeight: 700 }}
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Mode2Panel(props: {
  level: number;
  override: Mode2LevelOverride | undefined;
  onChange(value: Mode2LevelOverride | null): void;
}) {
  const { level, override, onChange } = props;

  const preset = useMemo(
    () =>
      engineOptionPresetForLevel(level, undefined, {
        options: override?.options ?? {},
        limits: numericLimits(override),
      }),
    [level, override],
  );

  const setOption = (name: string, value: string | number | boolean) => {
    onChange({
      options: { ...(override?.options ?? {}), [name]: value },
      ...numericLimits(override),
    });
  };

  const setBudget = (key: 'movetimeMs' | 'nodes' | 'depth', value: number | undefined) => {
    const merged: { movetimeMs?: number; nodes?: number; depth?: number } = {
      ...(typeof override?.movetimeMs === 'number' ? { movetimeMs: override.movetimeMs } : {}),
      ...(typeof override?.nodes === 'number' ? { nodes: override.nodes } : {}),
      ...(typeof override?.depth === 'number' ? { depth: override.depth } : {}),
    };
    if (value === undefined) delete merged[key];
    else merged[key] = value;
    onChange({ options: { ...(override?.options ?? {}) }, ...merged });
  };

  return (
    <>
      <Section title="引擎选项">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PIKAFISH_STRENGTH_OPTIONS.map(spec => (
            <OptionRow
              key={spec.name}
              spec={spec}
              value={effectiveValue(spec, preset.options, override?.options)}
              onChange={v => setOption(spec.name, v)}
            />
          ))}
        </div>
      </Section>

      <Section title="搜索预算">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SEARCH_BUDGET_FIELDS.map(f => {
            const current = (override as unknown as Record<string, number | undefined>)?.[f.key];
            return (
              <OptionRow
                key={f.key}
                spec={{ name: f.label, type: 'spin', min: f.min, max: f.max, defaultValue: f.hint, hint: f.unit }}
                value={typeof current === 'number' ? current : undefined}
                placeholder={String(preset.limits[f.key as 'movetimeMs' | 'nodes' | 'depth'] ?? '')}
                onChange={v => setBudget(f.key, typeof v === 'number' ? v : undefined)}
              />
            );
          })}
        </div>
      </Section>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={!override}
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            border: `1px solid ${C.borderStrong}`,
            backgroundColor: C.surface,
            color: C.textSec,
            fontSize: 11,
            opacity: override ? 1 : 0.45,
          }}
        >
          恢复默认
        </button>
      </div>
    </>
  );
}

function Mode3Panel(props: {
  difficulty: Difficulty;
  onDifficulty(d: Difficulty): void;
  temperature: OnnxTemperatureId;
  mateGuard: boolean;
  onTemperature(v: OnnxTemperatureId): void;
  onMateGuard(v: boolean): void;
}) {
  return (
    <>
      <Section title="档位">
        <div style={{ display: 'flex', gap: 8 }}>
          {TIER_IDS.map(t => {
            const active = props.difficulty === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => props.onDifficulty(t as Difficulty)}
                style={{
                  flex: 1,
                  padding: '12px 0',
                  borderRadius: 10,
                  border: `1px solid ${active ? C.accent : C.borderStrong}`,
                  backgroundColor: active ? C.accentSoft : C.surface,
                  color: active ? '#4C3418' : C.textSec,
                  fontSize: 14,
                  fontWeight: active ? 800 : 500,
                }}
              >
                T{t}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: C.muted }}>T1 最弱 · T5 最强</div>
      </Section>

      <Section title="选子">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TEMPERATURE_PRESETS.map(p => (
            <Choice
              key={p.id}
              label={p.label}
              active={props.temperature === p.id}
              onClick={() => props.onTemperature(p.id)}
            />
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: C.textSec }}>
          <input type="checkbox" checked={props.mateGuard} onChange={e => props.onMateGuard(e.target.checked)} />
          杀棋守卫
        </label>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------

function OptionRow(props: {
  spec: StrengthOptionSpec;
  value: string | number | boolean | undefined;
  placeholder?: string;
  onChange(v: string | number | boolean): void;
}) {
  const { spec, value, onChange } = props;
  const control = (() => {
    if (spec.type === 'check') {
      return <input type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)} />;
    }
    if (spec.type === 'combo') {
      return (
        <select
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          style={{ fontSize: 11, padding: '3px 6px', borderRadius: 6, border: `1px solid ${C.borderStrong}`, backgroundColor: '#fff', color: C.text }}
        >
          {(spec.vars ?? []).map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      );
    }
    return (
      <input
        type="number"
        min={spec.min}
        max={spec.max}
        value={value === undefined ? '' : String(value)}
        placeholder={props.placeholder}
        onChange={e => {
          const raw = e.target.value;
          if (raw === '') return;
          let n = Number(raw);
          if (!Number.isFinite(n)) return;
          if (spec.min !== undefined) n = Math.max(spec.min, n);
          if (spec.max !== undefined) n = Math.min(spec.max, n);
          onChange(n);
        }}
        style={{
          width: 96,
          fontSize: 11,
          padding: '3px 6px',
          borderRadius: 6,
          border: `1px solid ${C.borderStrong}`,
          backgroundColor: '#fff',
          color: C.text,
          textAlign: 'right',
        }}
      />
    );
  })();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{spec.name}</div>
        {spec.type === 'spin' && spec.min !== undefined ? (
          <div style={{ fontSize: 10, color: C.muted }}>{spec.min}–{spec.max}</div>
        ) : null}
      </div>
      {control}
    </div>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 1.5, color: C.muted, marginBottom: 7 }}>{props.title}</div>
      {props.children}
    </div>
  );
}

function Choice(props: { label: string; active: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        padding: '7px 14px',
        borderRadius: 999,
        border: `1px solid ${props.active ? C.accent : C.borderStrong}`,
        backgroundColor: props.active ? C.accentSoft : C.surface,
        color: props.active ? '#4C3418' : C.textSec,
        fontSize: 12,
        fontWeight: props.active ? 700 : 400,
      }}
    >
      {props.label}
    </button>
  );
}

function numericLimits(o: Mode2LevelOverride | undefined): { movetimeMs?: number; nodes?: number; depth?: number } | undefined {
  if (!o) return undefined;
  const limits: { movetimeMs?: number; nodes?: number; depth?: number } = {};
  if (typeof o.movetimeMs === 'number') limits.movetimeMs = o.movetimeMs;
  if (typeof o.nodes === 'number') limits.nodes = o.nodes;
  if (typeof o.depth === 'number') limits.depth = o.depth;
  return Object.keys(limits).length > 0 ? limits : undefined;
}

/** override > mode-2 preset > profile handshake default > engine default. */
function effectiveValue(
  spec: StrengthOptionSpec,
  preset: Record<string, string | number | boolean>,
  override: Record<string, string | number | boolean> | undefined,
): string | number | boolean | undefined {
  if (override && spec.name in override) return override[spec.name];
  if (spec.name in preset) return preset[spec.name];
  const profileDefault = PIKAFISH_PROFILE.defaultOptions[spec.name];
  if (profileDefault !== undefined) return profileDefault;
  return spec.defaultValue;
}
