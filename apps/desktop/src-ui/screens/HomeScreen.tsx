import React, { useState } from 'react';
import type { GameType, Side } from '@chesslab/rules-core';
import { CHESS_THEME, XIANGQI_THEME } from '../theme/games';

/** DOM port of apps/chessapp/src/screens/HomeScreen.tsx. */

export interface StartConfig {
  gameType: GameType;
  humanSide: Side;
  difficulty: 1 | 2 | 3 | 4 | 5;
}

const DIFF_LABELS = ['入门', '业余', '进阶', '大师', '特级'] as const;

const C = {
  rootBg: '#F1EADC',
  brand: '#33291C',
  brandSub: '#A2977F',
  segBorder: '#D8CDB8',
  segBg: '#FBF7EE',
  segActiveBorder: '#7A5230',
  segActiveBg: '#E9DCC4',
  segText: '#5C5343',
  segTextActive: '#4C3418',
  startBtn: '#33291C',
  startText: '#F5EDDD',
  muted: '#B7AD9C',
};

export function HomeScreen(props: {
  onStart(cfg: StartConfig): void;
  onDiagnostics(): void;
}) {
  const [picked, setPicked] = useState<GameType>('xiangqi');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [side, setSide] = useState<Side>('w');
  // no debug state in production

  return (
    <div
      style={{
        minHeight: '100%',
        backgroundColor: C.rootBg,
        overflowY: 'auto',
        paddingTop: 'max(env(safe-area-inset-top), 0px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingBottom: 'var(--sp-xxl)',
          width: '100%',
          maxWidth: '420px',
          padding: '0 16px',
          boxSizing: 'border-box',
        }}
      >
        <h1
          style={{
            fontSize: 34,
            fontWeight: 900,
            letterSpacing: 10,
            color: C.brand,
            marginTop: 'var(--sp-xxl)',
            textIndent: 10,
            textAlign: 'center',
          }}
        >
          棋弈
        </h1>
        <div style={{ fontSize: 9, letterSpacing: 4, color: C.brandSub, textAlign: 'center' }}>
          CHESS · XIANGQI — 单机对弈
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: 'var(--sp-xl)', justifyContent: 'center', flexWrap: 'wrap' }}>
          <GameCard
            active={picked === 'chess'}
            theme={CHESS_THEME}
            title="国际象棋"
            tag="STOCKFISH 18"
            onPress={() => setPicked('chess')}
            art={<MiniChessArt />}
          />
          <GameCard
            active={picked === 'xiangqi'}
            theme={XIANGQI_THEME}
            title="中国象棋"
            tag="PIKAFISH"
            onPress={() => setPicked('xiangqi')}
            art={<MiniXiangqiArt />}
          />
        </div>

        <Section label="执子">
          <div style={{ display: 'flex', gap: 'var(--sp-s)', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Seg
              label={picked === 'chess' ? '白先' : '红先'}
              active={side === 'w'}
              onPress={() => setSide('w')}
            />
            <Seg label="黑后" active={side === 'b'} onPress={() => setSide('b')} />
          </div>
        </Section>

        <Section label="难度">
          <div style={{ display: 'flex', gap: 'var(--sp-s)', flexWrap: 'wrap', justifyContent: 'center' }}>
            {DIFF_LABELS.map((l, i) => (
              <Seg
                key={l}
                label={l}
                active={difficulty === i + 1}
                onPress={() => setDifficulty((i + 1) as 1 | 2 | 3 | 4 | 5)}
              />
            ))}
          </div>
        </Section>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--sp-xl)' }}>
          <button
            type="button"
            onClick={() => props.onStart({ gameType: picked, humanSide: side, difficulty })}
            style={{
              backgroundColor: C.startBtn,
              padding: '13px 44px',
              borderRadius: 999,
            }}
          >
            <span style={{ color: C.startText, fontWeight: 800, fontSize: 15, letterSpacing: 4 }}>
              开始对局
            </span>
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--sp-s)' }}>
          <button type="button" onClick={props.onDiagnostics} style={{ padding: 'var(--sp-m)' }}>
            <span style={{ color: C.muted, fontSize: 11 }}>引擎诊断 ›</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Section(props: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ width: '100%', marginTop: 'var(--sp-l)' }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: 2,
          color: '#8A8070',
          marginBottom: 'var(--sp-s)',
          marginLeft: 2,
        }}
      >
        {props.label}
      </div>
      {props.children}
    </div>
  );
}

function Seg(props: { label: string; active: boolean; onPress(): void }) {
  const active = props.active;
  return (
    <button
      type="button"
      onClick={props.onPress}
      style={{
        padding: '7px 14px',
        borderRadius: 999,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: active ? C.segActiveBorder : C.segBorder,
        backgroundColor: active ? C.segActiveBg : C.segBg,
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: active ? C.segTextActive : C.segText,
          fontWeight: active ? 700 : 400,
        }}
      >
        {props.label}
      </span>
    </button>
  );
}

function GameCard(props: {
  active: boolean;
  theme: typeof CHESS_THEME;
  title: string;
  tag: string;
  art: React.ReactNode;
  onPress(): void;
}) {
  const t = props.theme;
  // Card colors come from the picked game's palette (static hex in RN too).
  const isChess = t.gameType === 'chess';
  const surface = isChess ? '#F7F3EA' : '#FAF5E9';
  const accent = isChess ? '#7A5230' : '#A63A2B';
  const bg = isChess ? '#EFE9DE' : '#F3EBDB';
  const textPrimary = isChess ? '#2A251D' : '#26211A';
  const textSecondary = isChess ? '#8B8271' : '#8A8070';

  return (
    <button
      type="button"
      onClick={props.onPress}
      style={{
        width: 150,
        flex: '0 0 150px',
        boxSizing: 'border-box',
        borderRadius: 14,
        borderWidth: 2,
        borderStyle: 'solid',
        borderColor: props.active ? accent : 'transparent',
        backgroundColor: surface,
        padding: 'var(--sp-m)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--sp-xs)',
      }}
    >
      <div
        style={{
          borderRadius: 8,
          padding: 'var(--sp-s)',
          marginBottom: 'var(--sp-xs)',
          backgroundColor: bg,
        }}
      >
        {props.art}
      </div>
      <span style={{ color: textPrimary, fontWeight: 800, fontSize: 15 }}>{props.title}</span>
      <span style={{ color: textSecondary, fontSize: 9, letterSpacing: 2 }}>{props.tag}</span>
    </button>
  );
}

/** Tiny board previews used on the home cards. */
function MiniChessArt() {
  const light = '#EDD6B0';
  const dark = '#AE8658';
  const cells = Array.from({ length: 16 }, (_, i) => (Math.floor(i / 4) + i) % 2 === 0);
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        width: 76,
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      {cells.map((isLight, i) => (
        <div key={i} style={{ width: 19, height: 19, backgroundColor: isLight ? light : dark }} />
      ))}
    </div>
  );
}

function MiniXiangqiArt() {
  return (
    <div
      style={{
        width: 76,
        height: 76,
        backgroundColor: '#E7CD97',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: '#4A3418',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ display: 'flex', gap: 6, marginBottom: -8 }}>
        <MiniDisc color="#A63A2B" char="帥" />
        <MiniDisc color="#33302A" char="將" />
      </div>
      <div style={{ color: '#6B4F2A', fontSize: 9, letterSpacing: 2, marginTop: 10 }}>
        楚河汉界
      </div>
    </div>
  );
}

function MiniDisc({ color, char }: { color: string; char: string }) {
  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#F6E7C8',
        borderWidth: 1.5,
        borderStyle: 'solid',
        borderColor: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span style={{ color, fontSize: 12, fontWeight: 700 }}>{char}</span>
    </div>
  );
}
