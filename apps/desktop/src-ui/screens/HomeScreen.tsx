import React from 'react';
import type { GameType } from '@chesslab/rules-core';
import { CHESS_THEME, XIANGQI_THEME } from '../theme/games';

/** DOM port of apps/chessapp/src/screens/HomeScreen.tsx. — 5: card click enters setup */

export type GameMode = 'pve' | 'pvp' | 'eve';

export interface StartConfig {
  gameType: GameType;
  mode: GameMode;
  humanSide: import('@chesslab/rules-core').Side;
  difficulty: 1 | 2 | 3 | 4 | 5;
  difficultySecond?: 1 | 2 | 3 | 4 | 5;
  stepMode?: boolean;
  autoDelayMs?: number;
}

const C = {
  rootBg: '#F1EADC',
  brand: '#33291C',
  brandSub: '#A2977F',
  muted: '#B7AD9C',
};

export function HomeScreen(props: {
  onPickGameType(gt: GameType): void;
  onSettings(): void;
  onDiagnostics(): void;
}) {
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
            theme={CHESS_THEME}
            title="国际象棋"
            tag="STOCKFISH 18"
            onPress={() => props.onPickGameType('chess')}
            art={<MiniChessArt />}
          />
          <GameCard
            theme={XIANGQI_THEME}
            title="中国象棋"
            tag="PIKAFISH"
            onPress={() => props.onPickGameType('xiangqi')}
            art={<MiniXiangqiArt />}
          />
        </div>

        <div style={{ marginTop: 'var(--sp-xl)', fontSize: 11, color: '#8A8070', textAlign: 'center', lineHeight: 1.6 }}>
          点击棋种卡片进入配置
          <br />
          可选人机 / 双人 / 观战（双机步进）
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-m)', marginTop: 'var(--sp-xl)', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" onClick={props.onSettings} style={{ padding: '8px 16px', borderRadius: 999, border: '1px solid #D8CDB8', background: '#FBF7EE', color: '#5C5343', fontSize: 12 }}>
            设置
          </button>
          <button type="button" onClick={props.onDiagnostics} style={{ padding: '8px 16px', borderRadius: 999, border: '1px solid transparent', background: 'transparent', color: C.muted, fontSize: 11 }}>
            引擎诊断 ›
          </button>
        </div>
      </div>
    </div>
  );
}

function GameCard(props: {
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
        borderColor: 'transparent',
        backgroundColor: surface,
        padding: 'var(--sp-m)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--sp-xs)',
      }}
      onMouseEnter={e => ((e.currentTarget.style.borderColor = accent), (e.currentTarget.style.transform = 'translateY(-2px)'))}
      onMouseLeave={e => ((e.currentTarget.style.borderColor = 'transparent'), (e.currentTarget.style.transform = 'none'))}
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
