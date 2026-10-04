import React, { useMemo, useState } from 'react';
import type { Puzzle } from '@chessnext/puzzles';
import { CURATED_PUZZLES, LARGE_PUZZLES } from '@chessnext/puzzles';
import { TopBar } from '../components/GameChrome';
import { usePuzzleProgress } from '../state/puzzles';

type Mode = 'curated' | 'large';

const HUB = {
  bg: '#F1EADC',
  surface: '#FBF7EE',
  surfaceAlt: '#EFE9DE',
  text: '#2A251D',
  textSec: '#5C5343',
  muted: '#8A8070',
  border: '#D8CDB8',
  borderSoft: '#E4DCCD',
  accent: '#7A5230',
  accentSoft: '#E9DCC4',
} as const;

export function PuzzlesScreen(props: { onBack(): void; onPick(p: Puzzle): void }) {
  const [mode, setMode] = useState<Mode>('curated');

  const hubTheme = {
    bg: HUB.bg,
    surface: HUB.surface,
    surfaceAlt: HUB.surfaceAlt,
    textPrimary: HUB.text,
    textSecondary: HUB.muted,
    accent: HUB.accent,
    accentSoft: HUB.accentSoft,
    danger: '#A33B31',
    ok: '#3E7C4F',
    board: { frame: '', frameBorder: '', lightSquare: '', darkSquare: '', line: '', coordText: '' },
    highlight: { selected: '', targetDot: '', lastMoveFrom: '', lastMoveTo: '', hint: '', checkKing: '' },
    pieces: { w: { fg: '', border: '', shadow: '' }, b: { fg: '', border: '', shadow: '' } },
    gameType: 'xiangqi' as const,
    displayName: '残局',
    subtitle: '',
  } as any;

  return (
    <div style={{ height: '100%', backgroundColor: HUB.bg, display: 'flex', flexDirection: 'column' }}>
      <TopBar theme={hubTheme} title="残局" subtitle={mode === 'curated' ? '精选练习' : '题库'} onBack={props.onBack} />

      {/* 顶部：模式分段（单胶囊容器） */}
      <div style={{ padding: '12px 16px 14px', display: 'flex', justifyContent: 'center', borderBottom: '1px solid rgba(0,0,0,0.06)', backgroundColor: HUB.bg }}>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'curated', label: '精选', count: CURATED_PUZZLES.length },
            { value: 'large', label: '题库', count: LARGE_PUZZLES.length },
          ]}
        />
      </div>

      {mode === 'curated' ? <CuratedList onPick={props.onPick} /> : <LargeList onPick={props.onPick} />}
    </div>
  );
}

/* iOS 风格分段：单容器 + 滑动白底 */
function Segmented(props: { value: Mode; onChange(v: Mode): void; options: { value: Mode; label: string; count: number }[] }) {
  return (
    <div style={{ display: 'flex', backgroundColor: HUB.surfaceAlt, borderRadius: 999, padding: 3, gap: 0, width: 260, boxSizing: 'border-box' }}>
      {props.options.map(o => {
        const active = props.value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => props.onChange(o.value)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              padding: '6px 0',
              borderRadius: 999,
              backgroundColor: active ? HUB.surface : 'transparent',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              border: 'none',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: active ? 800 : 500, color: active ? HUB.text : HUB.muted, letterSpacing: 0.2 }}>{o.label}</span>
            <span style={{ fontSize: 10, color: active ? HUB.muted : HUB.muted, opacity: active ? 0.9 : 0.7 }}>{o.count}题</span>
          </button>
        );
      })}
    </div>
  );
}

function CuratedList(props: { onPick(p: Puzzle): void }) {
  const { progress, reset } = usePuzzleProgress();
  const puzzles = CURATED_PUZZLES;
  const solved = puzzles.filter(p => progress.solved[p.id]).length;

  const grouped = useMemo(() => {
    const g: Record<number, Puzzle[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    for (const p of puzzles) g[p.rating]?.push(p);
    return g;
  }, [puzzles]);

  const diffLabel = (r: number) => ['入门', '进阶', '进阶', '大师', '特级'][r - 1] ?? '';

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ textAlign: 'center', color: HUB.muted, fontSize: 11, letterSpacing: 0.5 }}>
          {solved}/{puzzles.length} 已完成 · 人机对战
        </div>
        {[1, 2, 3, 4, 5].map(lv => {
          const list = grouped[lv];
          if (!list || list.length === 0) return null;
          return (
            <div key={lv}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, color: HUB.muted, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{diffLabel(lv)}</span>
                <span style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.06)' }} />
                <span style={{ fontSize: 10, color: HUB.muted }}>{list.length}题</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {list.map(p => {
                  const isSolved = !!progress.solved[p.id];
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => props.onPick(p)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '11px 12px',
                        borderRadius: 12,
                        backgroundColor: HUB.surface,
                        border: `1px solid ${isSolved ? HUB.border : HUB.borderSoft}`,
                        textAlign: 'left',
                        boxShadow: '0 1px 0 rgba(0,0,0,0.03)',
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: isSolved ? HUB.accent : HUB.surfaceAlt,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          border: `1px solid ${isSolved ? HUB.accent : HUB.border}`,
                        }}
                      >
                        <span style={{ color: isSolved ? '#FFF8EE' : HUB.textSec, fontWeight: 800, fontSize: 12 }}>{isSolved ? '✓' : p.rating}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: HUB.text, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</div>
                        <div style={{ color: HUB.muted, fontSize: 11, marginTop: 2, display: 'flex', gap: 6 }}>
                          <span>{p.themes.slice(0, 2).join(' · ')}</span>
                          {isSolved ? <span style={{ color: '#3E7C4F', fontWeight: 600 }}>· 已完成</span> : null}
                        </div>
                      </div>
                      <span style={{ color: HUB.muted, fontSize: 13, opacity: 0.7 }}>›</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
          <button type="button" onClick={reset} style={{ color: HUB.muted, fontSize: 11, padding: '6px 14px', border: `1px solid ${HUB.borderSoft}`, borderRadius: 999, background: HUB.surface }}>
            重置进度
          </button>
        </div>
        <div style={{ textAlign: 'center', color: HUB.muted, fontSize: 11, lineHeight: 1.6, padding: '4px 0 16px' }}>精选 · 循序渐进</div>
      </div>
    </div>
  );
}

function LargeList(props: { onPick(p: Puzzle): void }) {
  const { progress } = usePuzzleProgress();
  const all = LARGE_PUZZLES;

  const [query, setQuery] = useState('');
  const [diff, setDiff] = useState<number | null>(null);
  const [visible, setVisible] = useState(24);

  const filtered = useMemo(() => {
    let list = all;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(p => p.title.toLowerCase().includes(q) || p.themes.join(' ').toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
    }
    if (diff !== null) list = list.filter(p => p.rating === diff);
    return list;
  }, [all, query, diff]);

  const shown = filtered.slice(0, visible);
  const canMore = visible < filtered.length;

  const randomPick = () => {
    if (filtered.length === 0) return;
    const idx = Math.floor(Math.random() * filtered.length);
    props.onPick(filtered[idx]!);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8, backgroundColor: HUB.bg, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, backgroundColor: HUB.surface, border: `1px solid ${HUB.borderSoft}`, borderRadius: 999, padding: '7px 12px' }}>
            <SearchIcon />
            <input
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setVisible(24);
              }}
              placeholder="搜索题目或主题"
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: HUB.text }}
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} style={{ color: HUB.muted, fontSize: 12, padding: '2px 4px' }}>
                ✕
              </button>
            ) : null}
          </div>
          <button type="button" onClick={randomPick} style={{ padding: '8px 14px', borderRadius: 999, backgroundColor: HUB.surface, border: `1px solid ${HUB.border}`, color: HUB.textSec, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            随机
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: HUB.muted, letterSpacing: 0.5 }}>难度</span>
          {[null, 1, 2, 3, 4, 5].map(v => (
            <button
              key={String(v)}
              type="button"
              onClick={() => {
                setDiff(v);
                setVisible(24);
              }}
              style={{
                padding: '5px 10px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: v === diff ? 700 : 400,
                border: `1px solid ${diff === v ? HUB.accent : HUB.border}`,
                backgroundColor: diff === v ? HUB.accentSoft : HUB.surface,
                color: HUB.textSec,
              }}
            >
              {v === null ? '全部' : `${v} 级`}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: HUB.muted }}>
            {filtered.length} 题 · 已完成 {filtered.filter(p => progress.solved[p.id]).length}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: HUB.bg }}>
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map(p => {
            const solved = !!progress.solved[p.id];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => props.onPick(p)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  backgroundColor: HUB.surface,
                  border: `1px solid ${solved ? HUB.border : HUB.borderSoft}`,
                  textAlign: 'left',
                  boxShadow: '0 1px 0 rgba(0,0,0,0.03)',
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: solved ? HUB.accent : HUB.surfaceAlt,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    border: `1px solid ${solved ? HUB.accent : HUB.borderSoft}`,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 800, color: solved ? '#FFF8EE' : HUB.textSec }}>{solved ? '✓' : p.rating}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: HUB.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: HUB.muted, display: 'flex', gap: 6, marginTop: 1, alignItems: 'center' }}>
                    <span>{p.themes[0]}</span>
                    <span style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: HUB.border }} />
                    <span>{p.id.slice(-6)}</span>
                  </div>
                </div>
                <span style={{ fontSize: 11, color: HUB.textSec, backgroundColor: HUB.surfaceAlt, border: `1px solid ${HUB.borderSoft}`, padding: '3px 7px', borderRadius: 999, flexShrink: 0 }}>{p.rating} 级</span>
              </button>
            );
          })}
          {filtered.length === 0 ? <div style={{ textAlign: 'center', color: HUB.muted, fontSize: 12, padding: 24, backgroundColor: HUB.surface, borderRadius: 10, border: `1px solid ${HUB.borderSoft}` }}>无匹配，换个关键词</div> : null}
          {canMore ? (
            <button type="button" onClick={() => setVisible(v => v + 24)} style={{ marginTop: 4, padding: '10px 0', borderRadius: 999, backgroundColor: HUB.surface, border: `1px solid ${HUB.border}`, color: HUB.textSec, fontSize: 12, fontWeight: 600 }}>
              加载更多 · 剩余 {filtered.length - shown.length}
            </button>
          ) : filtered.length > 0 ? (
            <div style={{ textAlign: 'center', color: HUB.muted, fontSize: 11, padding: '12px 0' }}>已显示全部 · 共 {filtered.length} 题</div>
          ) : null}
          <div style={{ textAlign: 'center', color: HUB.muted, fontSize: 11, lineHeight: 1.6, padding: '8px 0 16px' }}>题库 · 按需选练</div>
        </div>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="6" cy="6" r="4.2" stroke="#8A8070" strokeWidth="1.3" />
      <path d="M9.2 9.2L12 12" stroke="#8A8070" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
