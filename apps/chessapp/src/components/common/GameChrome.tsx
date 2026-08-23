import React from 'react';
import { Modal, Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import type { GameResult, HistoryEntry, Side } from '@chesslab/rules-core';
import type { AssistLine } from '@chesslab/game-session';
import { spacing } from '../../theme/tokens';
import type { GameTheme } from '../../theme/games';

export function TopBar(props: {
  theme: GameTheme;
  title: string;
  subtitle: string;
  onBack(): void;
  right?: React.ReactNode;
}) {
  return (
    <View style={[styles.topBar, { backgroundColor: props.theme.surface }]}>
      <Pressable onPress={props.onBack} hitSlop={10}>
        <Text style={{ color: props.theme.accent, fontSize: 17, paddingHorizontal: spacing.s }}>
          ‹
        </Text>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={{ color: props.theme.textPrimary, fontWeight: '700', fontSize: 16 }}>
          {props.title}
        </Text>
        <Text
          style={{
            color: props.theme.textSecondary,
            fontSize: 9,
            letterSpacing: 3,
            marginTop: -1,
          }}
        >
          {props.subtitle}
        </Text>
      </View>
      {props.right}
    </View>
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
    <View style={styles.statusRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={{ color, fontSize: 13, fontWeight: '600', flex: 1 }} numberOfLines={1}>
        {text}
      </Text>
    </View>
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
  const head =
    r.winner === null ? '和棋' : win ? '胜利 🎉' : '失败';
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
    <View style={styles.controlsRow}>
      {props.controls.map(c => (
        <Pressable
          key={c.label}
          disabled={c.disabled}
          onPress={c.onPress}
          style={[
            styles.controlBtn,
            {
              borderColor:
                c.tone === 'danger'
                  ? theme.danger
                  : c.active
                    ? theme.accent
                    : theme.surfaceAlt,
              backgroundColor: c.active ? theme.accentSoft : theme.surface,
              opacity: c.disabled ? 0.4 : 1,
            },
          ]}
        >
          <Text
            style={{
              color: c.tone === 'danger' ? theme.danger : theme.textPrimary,
              fontSize: 12,
              fontWeight: '600',
            }}
          >
            {c.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function MoveListStrip(props: {
  theme: GameTheme;
  history: readonly HistoryEntry[];
}) {
  const pairs: string[] = [];
  for (let i = 0; i < props.history.length; i += 2) {
    const w = props.history[i]?.san ?? '';
    const b = props.history[i + 1]?.san ?? '';
    pairs.push(`${i / 2 + 1}. ${w}${b ? ` ${b}` : ''}`);
  }
  const ref = React.useRef<ScrollView>(null);
  React.useEffect(() => {
    ref.current?.scrollToEnd({ animated: false });
  }, [props.history.length]);

  return (
    <View style={[styles.moveStrip, { backgroundColor: props.theme.surfaceAlt }]}>
      <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false}>
        {pairs.length === 0 ? (
          <Text style={{ color: props.theme.textSecondary, fontSize: 11, paddingVertical: 6 }}>
            — 着法记录 —
          </Text>
        ) : (
          pairs.map((p, i) => (
            <Text
              key={i}
              style={{
                color: i === pairs.length - 1 ? props.theme.accent : props.theme.textPrimary,
                fontSize: 11,
                fontFamily: undefined,
                paddingVertical: 6,
                paddingHorizontal: 7,
                fontWeight: i === pairs.length - 1 ? '700' : '400',
              }}
            >
              {p}
            </Text>
          ))
        )}
      </ScrollView>
    </View>
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
    <View style={[styles.assist, { borderColor: theme.accentSoft }]}>
      <Text style={{ color: theme.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>
        辅助分析
      </Text>
      {props.lines.length === 0 ? (
        <Text style={{ color: theme.textSecondary, fontSize: 11 }}>计算中…</Text>
      ) : (
        <View style={{ flex: 1, flexDirection: 'row', gap: spacing.m, alignItems: 'center' }}>
          {props.lines.slice(0, 3).map(l => (
            <View key={l.multipv} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text
                style={{
                  color: l.multipv === 1 ? theme.accent : theme.textPrimary,
                  fontWeight: '800',
                  fontSize: 12,
                }}
              >
                {fmtScore(l)}
              </Text>
              <Text style={{ color: theme.textPrimary, fontSize: 11 }}>{l.pv.slice(0, 3).join(' ')}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function ResultOverlay(props: {
  visible: boolean;
  theme: GameTheme;
  headline: string;
  detail: string;
  onNewGame(): void;
  onClose(): void;
}) {
  const { theme } = props;
  return (
    <Modal transparent visible={props.visible} animationType="fade" onRequestClose={props.onClose}>
      <View style={styles.overlayRoot}>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: theme.textPrimary }}>
            {props.headline}
          </Text>
          <Text style={{ color: theme.textSecondary, marginTop: 4, marginBottom: spacing.l }}>
            {props.detail}
          </Text>
          <Pressable
            onPress={props.onNewGame}
            style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
          >
            <Text style={{ color: '#FFF8EE', fontWeight: '700' }}>再来一局</Text>
          </Pressable>
          <Pressable onPress={props.onClose} hitSlop={8} style={{ marginTop: spacing.m }}>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>回看棋盘</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 48,
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.s,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.s,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.s,
  },
  controlBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  moveStrip: {
    maxHeight: 26,
    paddingHorizontal: spacing.s,
  },
  assist: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    marginHorizontal: spacing.l,
    marginBottom: spacing.s,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.m,
    paddingVertical: 6,
  },
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,15,8,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 14,
    alignItems: 'center',
    padding: spacing.xl,
  },
  primaryBtn: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
});
