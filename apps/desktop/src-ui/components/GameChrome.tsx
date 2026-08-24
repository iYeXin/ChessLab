import React, { useEffect, useRef } from 'react';
import type { GameResult, HistoryEntry, Side } from '@chesslab/rules-core';
import type { AssistLine } from '@chesslab/game-session';
import type { GameTheme } from '../theme/games';

/**
 * DOM port of apps/chessapp/src/components/common/GameChrome.tsx.
 * Layout metrics and colors follow the RN reference 1:1.
 */

export function TopBar(props: {
  theme: GameTheme;
  title: string;
  subtitle: string;
  onBack(): void;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        height: 48,
        display: 'flex',
        alignItems: 'center',
        flexDirection: 'row',
        gap: 'var(--sp-xs)',
        padding: '0 var(--sp-s)',
        backgroundColor: props.theme.surface,
        borderBottom: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      <button
        type="button"
        onClick={props.onBack}
        style={{
          color: props.theme.accent,
          fontSize: 17,
          padding: '0 var(--sp-s)',
          lineHeight: 1,
        }}
      >
        ‹
      </button>
      <div style={{ flex: 1 }}>
        <div
          style={{ color: props.theme.textPrimary, fontWeight: 700, fontSize: 16 }}
        >
          {props.title}
        </div>
        <div
          style={{
            color: props.theme.textSecondary,
            fontSize: 9,
            letterSpacing: 3,
            marginTop: -1,
          }}
        >
          {props.subtitle}
        </div>
      </div>
      {props.right}
    </div>
  );
}

export function StatusBanner(props: {
  theme: GameTheme;
  turn: Side;
  humanSide: Side;
  thinkingSide: Side | null;
  check: boolean;
  bootError: string | null;
  result: GameResult | null;
}) {
  const { theme } = props;
  let text = '';
  let color = theme.textSecondary;

  if (props.bootError) {
    text = `引擎异常：${props.bootError}`;
    color = theme.danger;
  } else if (props.result) {
    text = describeResult(props.result, props.humanSide);
    color = theme.accent;
  } else if (props.thinkingSide) {
    text = '思考中…';
  } else {
    const yours = props.turn === props.humanSide;
    text = `${yours ? '你的回合' : '对方回合'} · ${props.turn === 'w' ? '红/白' : '黑'}${
      props.check ? ' · 将军!' : ''
    }`;
    if (props.check) color = theme.danger;
    else if (yours) color = theme.ok;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 'var(--sp-s)',
        padding: 'var(--sp-s) var(--sp-l)',
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <div
        style={{
          color,
          fontSize: 13,
          fontWeight: 600,
          flex: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {text}
      </div>
    </div>
  );
}

function describeResult(r: GameResult, humanSide: Side): string {
  const win = r.winner === humanSide;
  const reasonMap: Record<string, string> = {
    checkmate: r.winner ? (win ? '绝杀取胜' : '被将死') : '',
    'no-legal-moves': r.winner ? (win ? '对方困毙' : '困毙判负') : '',
    resign: r.winner ? (win ? '对方认输' : '你已认输') : '',
    timeout: r.winner ? (win ? '对方超时' : '超时判负') : '',
    stalemate: '逼和（无子可动）',
    repetition: '三次重复局面判和',
    'fifty-move-rule': '五十回合规则判和',
    'insufficient-material': '子力不足判和',
    agreement: '和棋',
  };
  const head = r.winner === null ? '和棋' : win ? '胜利 🎉' : '失败';
  const tail = reasonMap[r.reason] ?? r.reason;
  return tail && !tail.includes(win === true ? '取' : '') ? `${head} · ${tail}` : head;
}

export interface ControlDef {
  label: string;
  onPress(): void;
  disabled?: boolean;
  active?: boolean;
  tone?: 'normal' | 'danger' | 'accent';
}

export function ControlsBar(props: { theme: GameTheme; controls: ControlDef[] }) {
  const { theme } = props;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 'var(--sp-s)',
        padding: 'var(--sp-s) var(--sp-l)',
      }}
    >
      {props.controls.map(c => (
        <button
          key={c.label}
          type="button"
          disabled={c.disabled}
          onClick={c.onPress}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 0',
            borderRadius: 8,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor:
              c.tone === 'danger'
                ? theme.danger
                : c.active
                  ? theme.accent
                  : theme.surfaceAlt,
            backgroundColor: c.active ? theme.accentSoft : theme.surface,
            opacity: c.disabled ? 0.4 : 1,
          }}
        >
          <span
            style={{
              color: c.tone === 'danger' ? theme.danger : theme.textPrimary,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {c.label}
          </span>
        </button>
      ))}
    </div>
  );
}

export function MoveListStrip(props: { theme: GameTheme; history: readonly HistoryEntry[] }) {
  const pairs: string[] = [];
  for (let i = 0; i < props.history.length; i += 2) {
    const w = props.history[i]?.san ?? '';
    const b = props.history[i + 1]?.san ?? '';
    pairs.push(`${i / 2 + 1}. ${w}${b ? ` ${b}` : ''}`);
  }
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth;
  }, [props.history.length]);

  return (
    <div
      style={{
        maxHeight: 26,
        padding: '0 var(--sp-s)',
        backgroundColor: props.theme.surfaceAlt,
        overflowX: 'auto',
        overflowY: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      <div ref={ref} style={{ display: 'inline-flex', minWidth: '100%' }}>
        {pairs.length === 0 ? (
          <span
            style={{
              color: props.theme.textSecondary,
              fontSize: 11,
              padding: '6px 0',
            }}
          >
            — 着法记录 —
          </span>
        ) : (
          pairs.map((p, i) => (
            <span
              key={i}
              style={{
                color:
                  i === pairs.length - 1 ? props.theme.accent : props.theme.textPrimary,
                fontSize: 11,
                padding: '6px 7px',
                fontWeight: i === pairs.length - 1 ? 700 : 400,
              }}
            >
              {p}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

export function AssistPanel(props: {
  theme: GameTheme;
  lines: AssistLine[];
  historyLast: HistoryEntry | null;
}) {
  const { theme } = props;
  const fmtScore = (l: AssistLine): string => {
    if (l.scoreMate !== undefined) return `#${l.scoreMate > 0 ? '' : '-'}${Math.abs(l.scoreMate)}`;
    if (l.scoreCp !== undefined) return `${(l.scoreCp / 100).toFixed(2)}`;
    return '?';
  };
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 'var(--sp-m)',
        margin: '0 var(--sp-l) var(--sp-s)',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: theme.accentSoft,
        borderRadius: 8,
        padding: '6px var(--sp-m)',
      }}
    >
      <span style={{ color: theme.accent, fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>
        辅助分析
      </span>
      {props.lines.length === 0 ? (
        <span style={{ color: theme.textSecondary, fontSize: 11 }}>计算中…</span>
      ) : (
        <div style={{ flex: 1, display: 'flex', gap: 'var(--sp-m)', alignItems: 'center' }}>
          {props.lines.slice(0, 3).map(l => (
            <div key={l.multipv} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  color: l.multipv === 1 ? theme.accent : theme.textPrimary,
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {fmtScore(l)}
              </span>
              <span style={{ color: theme.textPrimary, fontSize: 11 }}>
                {l.pv.slice(0, 3).join(' ')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ResultOverlay(props: {
  visible: boolean;
  theme: GameTheme;
  headline: string;
  detail: string;
  history?: readonly HistoryEntry[];
  onNewGame(): void;
  onClose(): void;
}) {
  const { theme } = props;
  const [showHistory, setShowHistory] = React.useState(false);
  React.useEffect(() => {
    if (!props.visible) setShowHistory(false);
  }, [props.visible]);
  if (!props.visible) return null;

  const hasHistory = !!props.history && props.history.length > 0;

  return (
    <>
      <div
        className="result-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(20,15,8,0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--sp-xl)',
          animation: 'fadeIn 160ms ease-out',
        }}
        onClick={props.onClose}
      >
        <div
          className="result-card"
          style={{
            width: '100%',
            maxWidth: 340,
            borderRadius: 14,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: 'var(--sp-xl)',
            backgroundColor: theme.surface,
            boxShadow: '0 12px 40px rgba(20,15,8,0.35)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <span style={{ fontSize: 22, fontWeight: 800, color: theme.textPrimary }}>{props.headline}</span>
          <span style={{ color: theme.textSecondary, marginTop: 4, marginBottom: 'var(--sp-m)', fontSize: 13 }}>{props.detail}</span>

          {hasHistory ? (
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              style={{ marginBottom: 'var(--sp-m)', padding: '6px 12px', borderRadius: 8, border: `1px solid ${theme.surfaceAlt}`, background: theme.surfaceAlt, color: theme.textPrimary, fontSize: 12 }}
            >
              查看着法（{props.history!.length}步）
            </button>
          ) : null}

          <button
            type="button"
            onClick={props.onNewGame}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 0', borderRadius: 10, backgroundColor: theme.accent }}
          >
            <span style={{ color: '#FFF8EE', fontWeight: 700 }}>再来一局</span>
          </button>
          <button type="button" onClick={props.onClose} style={{ marginTop: 'var(--sp-m)', padding: '4px 8px' }}>
            <span style={{ color: theme.textSecondary, fontSize: 12 }}>回看棋盘</span>
          </button>
        </div>
      </div>
      {showHistory && hasHistory ? <HistoryModal theme={theme} history={props.history!} onClose={() => setShowHistory(false)} /> : null}
    </>
  );
}

export function HistoryModal(props: { theme: GameTheme; history: readonly HistoryEntry[]; onClose(): void }) {
  const { theme } = props;
  const pairs: string[] = [];
  for (let i = 0; i < props.history.length; i += 2) {
    const w = props.history[i]?.san ?? '';
    const b = props.history[i + 1]?.san ?? '';
    pairs.push(`${i / 2 + 1}. ${w}${b ? ` ${b}` : ''}`);
  }
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(20,15,8,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-xl)', zIndex: 60 }} onClick={props.onClose}>
      <div
        style={{ width: '100%', maxWidth: 360, maxHeight: '70vh', backgroundColor: theme.surface, borderRadius: 12, padding: 'var(--sp-l)', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(20,15,8,0.35)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-m)' }}>
          <span style={{ fontWeight: 700, color: theme.textPrimary }}>着法记录</span>
          <button type="button" onClick={props.onClose} style={{ color: theme.accent, fontSize: 12, padding: '4px 8px' }}>
            关闭
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {pairs.length === 0 ? (
            <span style={{ color: theme.textSecondary, fontSize: 12 }}>暂无着法</span>
          ) : (
            pairs.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 8px', borderRadius: 6, backgroundColor: i % 2 === 0 ? theme.surfaceAlt : 'transparent' }}>
                <span style={{ color: theme.textSecondary, fontSize: 12, minWidth: 24 }}>{i + 1}.</span>
                <span style={{ color: theme.textPrimary, fontSize: 12 }}>{p.replace(/^\d+\.\s*/, '')}</span>
              </div>
            ))
          )}
        </div>
        <div style={{ marginTop: 'var(--sp-m)', color: theme.textSecondary, fontSize: 10, textAlign: 'center' }}>共 {props.history.length} 步</div>
      </div>
    </div>
  );
}
