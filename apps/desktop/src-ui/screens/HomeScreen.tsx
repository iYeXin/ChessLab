import React from 'react';

/** 首页 — 单一棋种（中国象棋），实验性版本。 */

const C = {
  rootBg: '#F1EADC',
  brand: '#33291C',
  brandSub: '#A2977F',
  muted: '#B7AD9C',
};

export function HomeScreen(props: {
  onPlay(): void;
  onPuzzles(): void;
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
          CHESSNEXT · 中国象棋 · 单机对弈
        </div>

        {/* 小字：实验性版本说明 */}
        <div
          style={{
            marginTop: 10,
            fontSize: 10,
            letterSpacing: 1.5,
            color: C.muted,
            backgroundColor: '#FBF7EE',
            border: '1px solid #E4DCCD',
            borderRadius: 999,
            padding: '3px 12px',
          }}
        >
          实验性版本 · 仅供研究
        </div>

        <button
          type="button"
          onClick={props.onPlay}
          style={{
            marginTop: 'var(--sp-xl)',
            width: '100%',
            maxWidth: 312,
            boxSizing: 'border-box',
            borderRadius: 14,
            borderWidth: 2,
            borderStyle: 'solid',
            borderColor: 'transparent',
            backgroundColor: '#FAF5E9',
            padding: 'var(--sp-m)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--sp-xs)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = '#A63A2B';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'transparent';
            e.currentTarget.style.transform = 'none';
          }}
        >
          <div style={{ borderRadius: 8, padding: 'var(--sp-s)', marginBottom: 'var(--sp-xs)', backgroundColor: '#F3EBDB' }}>
            <MiniXiangqiArt />
          </div>
          <span style={{ color: '#26211A', fontWeight: 800, fontSize: 15 }}>中国象棋</span>
          <span style={{ color: '#8A8070', fontSize: 9, letterSpacing: 2 }}>PIKAFISH</span>
        </button>

        <div style={{ marginTop: 'var(--sp-m)', fontSize: 11, color: '#8A8070', textAlign: 'center', lineHeight: 1.6 }}>
          点击卡片进入配置
          <br />
          可选人机 / 双人 / 观战（双机步进）
        </div>

        {/* 残局入口 — 与对弈卡同语言的轻量横卡 */}
        <button
          type="button"
          onClick={props.onPuzzles}
          style={{
            marginTop: 'var(--sp-xl)',
            width: '100%',
            maxWidth: 312,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 14px',
            borderRadius: 12,
            backgroundColor: '#FBF7EE',
            border: '1px solid #D8CDB8',
            boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
            textAlign: 'left',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#C8BBA6')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = '#D8CDB8')}
        >
          <div style={{ width: 42, height: 42, borderRadius: 8, backgroundColor: '#EFE9DE', border: '1px solid #E4DCCD', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MiniPuzzleArt />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#2A251D', fontWeight: 800, fontSize: 13, letterSpacing: 0.3 }}>残局</div>
            <div style={{ color: '#8A8070', fontSize: 11, marginTop: 1 }}>精选与题库 · 循序渐进</div>
          </div>
          <span style={{ color: '#B7AD9C', fontSize: 13, paddingLeft: 4 }}>›</span>
        </button>

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

function MiniPuzzleArt() {
  // 极简棋盘 + 目标点，保持安静
  const light = '#EDE0C8';
  const dark = '#C8A88A';
  const accent = '#7A5230';
  return (
    <div style={{ width: 36, height: 36, display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: 1 }}>
        <div style={{ width: 10, height: 10, backgroundColor: light, borderRadius: 1 }} />
        <div style={{ width: 10, height: 10, backgroundColor: dark, borderRadius: 1 }} />
        <div style={{ width: 10, height: 10, backgroundColor: light, borderRadius: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 1 }}>
        <div style={{ width: 10, height: 10, backgroundColor: dark, borderRadius: 1 }} />
        <div style={{ width: 10, height: 10, backgroundColor: accent, borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#F5EDDD' }} />
        </div>
        <div style={{ width: 10, height: 10, backgroundColor: dark, borderRadius: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 1 }}>
        <div style={{ width: 10, height: 10, backgroundColor: light, borderRadius: 1 }} />
        <div style={{ width: 10, height: 10, backgroundColor: dark, borderRadius: 1 }} />
        <div style={{ width: 10, height: 10, backgroundColor: light, borderRadius: 1 }} />
      </div>
    </div>
  );
}
