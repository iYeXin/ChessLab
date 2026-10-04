import React, { useState } from 'react';
import { DIFFICULTY_IDS, difficultyLabel, levelForDifficulty, type Difficulty } from '../state/difficulty';
import { engineModeFor, useSettings, type EngineModeTarget } from '../state/settings';
import { DifficultyModal } from './DifficultyModal';

/**
 * Difficulty selector.
 *
 * Default behaviour is the original inline pill row. When 测试人员模式 is on it
 * collapses to a single button that opens the full difficulty modal (mode 1/2/3
 * plus mode-specific settings), because this build has several experimental
 * difficulty paths to choose between.
 */
export function DifficultyPicker(props: {
  /** Modal title, e.g. "难度" or "黑方 棋力". */
  label: string;
  /** Which engine-mode setting this picker edits (观战模式按方独立). */
  modeTarget?: EngineModeTarget;
  difficulty: Difficulty;
  onChange(d: Difficulty): void;
  /** Show the engine level next to each label (setup screen convenience). */
  showLevel?: boolean;
}) {
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const target: EngineModeTarget = props.modeTarget ?? 'global';
  const mode = engineModeFor(settings, target);

  if (settings.testerMode) {
    const level = levelForDifficulty(props.difficulty);
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 14px',
            borderRadius: 10,
            border: '1px solid #D8CDB8',
            backgroundColor: '#FBF7EE',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: '#4C3418' }}>
            {difficultyLabel(props.difficulty)}
          </span>
          <span style={{ fontSize: 10, color: '#8A8070' }}>
            模式 {mode} · 强度 {level}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: '#A63A2B', fontWeight: 600 }}>调整 ›</span>
        </button>

        <DifficultyModal
          visible={open}
          label={props.label}
          modeTarget={target}
          difficulty={props.difficulty}
          onDifficulty={d => props.onChange(d)}
          onClose={() => setOpen(false)}
        />
      </>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {DIFFICULTY_IDS.map(d => {
        const active = props.difficulty === d;
        return (
          <button
            key={d}
            type="button"
            onClick={() => props.onChange(d)}
            style={{
              padding: '7px 14px',
              borderRadius: 999,
              border: `1px solid ${active ? '#A63A2B' : '#D8CDB8'}`,
              backgroundColor: active ? '#E9DCC4' : '#FBF7EE',
              color: active ? '#4C3418' : '#5C5343',
              fontSize: 12,
              fontWeight: active ? 700 : 400,
            }}
          >
            {difficultyLabel(d)}
            {props.showLevel ? (
              <span style={{ fontSize: 9, color: '#8A8070', marginLeft: 4 }}>
                {levelForDifficulty(d)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
