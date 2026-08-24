import React, { useState } from 'react';
import type { GameType, Side } from '@chesslab/rules-core';
import { themeFor, themeClassFor } from '../theme/games';
import { TopBar } from '../components/GameChrome';
import type { StartConfig, GameMode } from './HomeScreen';
import { useSettings } from '../state/settings';

const DIFF_LABELS = ['入门', '业余', '进阶', '大师', '特级'] as const;

export function GameSetupScreen(props: {
  gameType: GameType;
  onBack(): void;
  onStart(cfg: StartConfig): void;
}) {
  const theme = themeFor(props.gameType);
  const { settings } = useSettings();
  const [side, setSide] = useState<Side>('w');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [mode, setMode] = useState<GameMode>('pve');
  const [difficultySecond, setDifficultySecond] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [stepMode, setStepMode] = useState(false);
  const [autoDelayMs, setAutoDelayMs] = useState<number>(settings.autoDelayMs);

  const isChess = props.gameType === 'chess';
  const title = isChess ? '国际象棋' : '中国象棋';
  const tag = isChess ? 'STOCKFISH 18' : 'PIKAFISH';

  const handleStart = () => {
    props.onStart({
      gameType: props.gameType,
      mode,
      humanSide: side,
      difficulty,
      difficultySecond: mode === 'eve' ? difficultySecond : undefined,
      stepMode: mode === 'eve' ? stepMode : undefined,
      autoDelayMs: mode === 'eve' && !stepMode ? autoDelayMs : undefined,
    });
  };

  return (
    <div className={themeClassFor(props.gameType)} style={{ height: '100%', backgroundColor: '#F1EADC', display: 'flex', flexDirection: 'column' }}>
      <TopBar theme={theme} title={title} subtitle={tag} onBack={props.onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-l) var(--sp-l)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 'var(--sp-l)' }}>
          {/* Mode selector (pve/pvp/eve) - item 7 */}
          <Section label="对战模式">
            <div style={{ display: 'flex', gap: 'var(--sp-s)', flexWrap: 'wrap' }}>
              <Seg label="人机" active={mode === 'pve'} onPress={() => setMode('pve')} />
              <Seg label="双人" active={mode === 'pvp'} onPress={() => setMode('pvp')} />
              <Seg label="观战" desc="双机·步进" active={mode === 'eve'} onPress={() => setMode('eve')} />
            </div>
            {mode === 'eve' ? (
              <div style={{ marginTop: 'var(--sp-s)', fontSize: 10, color: '#8A8070' }}>
                观战模式：双方由引擎执子，可分别设置棋力；{stepMode ? '每点击“下一步”前进一步' : '自动对弈'}
              </div>
            ) : null}
          </Section>

          {mode === 'pve' ? (
            <Section label="执子">
              <div style={{ display: 'flex', gap: 'var(--sp-s)', flexWrap: 'wrap' }}>
                <Seg label={isChess ? '白先' : '红先'} active={side === 'w'} onPress={() => setSide('w')} />
                <Seg label="黑后" active={side === 'b'} onPress={() => setSide('b')} />
              </div>
            </Section>
          ) : null}

          <Section label={mode === 'eve' ? '红方/白方 棋力' : mode === 'pvp' ? '难度（仅作记录）' : '难度'}>
            <div style={{ display: 'flex', gap: 'var(--sp-s)', flexWrap: 'wrap' }}>
              {DIFF_LABELS.map((l, i) => (
                <Seg key={l} label={l} active={difficulty === i + 1} onPress={() => setDifficulty((i + 1) as 1 | 2 | 3 | 4 | 5)} />
              ))}
            </div>
          </Section>

          {mode === 'eve' ? (
            <>
              <Section label="黑方棋力">
                <div style={{ display: 'flex', gap: 'var(--sp-s)', flexWrap: 'wrap' }}>
                  {DIFF_LABELS.map((l, i) => (
                    <Seg key={l} label={l} active={difficultySecond === i + 1} onPress={() => setDifficultySecond((i + 1) as 1 | 2 | 3 | 4 | 5)} />
                  ))}
                </div>
              </Section>
              <Section label="步进">
                <div style={{ display: 'flex', gap: 'var(--sp-s)' }}>
                  <Seg label="自动" active={!stepMode} onPress={() => setStepMode(false)} />
                  <Seg label="手动步进" desc="每步需点下一步" active={stepMode} onPress={() => setStepMode(true)} />
                </div>
              </Section>
              {!stepMode ? (
                <Section label="自动延迟">
                  <div style={{ display: 'flex', gap: 'var(--sp-s)', flexWrap: 'wrap' }}>
                    {[0, 500, 800, 1200, 2000].map(v => (
                      <Seg key={v} label={v === 0 ? '无' : `${v / 1000}秒`} active={autoDelayMs === v} onPress={() => setAutoDelayMs(v as any)} />
                    ))}
                  </div>
                </Section>
              ) : null}
            </>
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--sp-xl)' }}>
            <button type="button" onClick={handleStart} style={{ backgroundColor: '#33291C', padding: '13px 44px', borderRadius: 999 }}>
              <span style={{ color: '#F5EDDD', fontWeight: 800, fontSize: 15, letterSpacing: 4 }}>开始对局</span>
            </button>
          </div>

          <div style={{ textAlign: 'center', color: '#A2977F', fontSize: 10, marginTop: 'var(--sp-s)' }}>
            {mode === 'pve' ? '人机：你执一色，引擎执另一色' : mode === 'pvp' ? '双人：本地轮流落子' : '观战：引擎对引擎，可调双方棋力'}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section(props: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ width: '100%' }}>
      <div style={{ fontSize: 10, letterSpacing: 2, color: '#8A8070', marginBottom: 'var(--sp-s)', marginLeft: 2 }}>{props.label}</div>
      {props.children}
    </div>
  );
}

function Seg(props: { label: string; desc?: string; active: boolean; onPress(): void }) {
  const C = { segBorder: '#D8CDB8', segBg: '#FBF7EE', segActiveBorder: '#7A5230', segActiveBg: '#E9DCC4', segText: '#5C5343', segTextActive: '#4C3418' };
  return (
    <button
      type="button"
      onClick={props.onPress}
      style={{
        padding: '7px 14px',
        borderRadius: 999,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: props.active ? C.segActiveBorder : C.segBorder,
        backgroundColor: props.active ? C.segActiveBg : C.segBg,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <span style={{ fontSize: 12, color: props.active ? C.segTextActive : C.segText, fontWeight: props.active ? 700 : 400 }}>{props.label}</span>
      {props.desc ? <span style={{ fontSize: 10, color: '#8A8070' }}>{props.desc}</span> : null}
    </button>
  );
}
