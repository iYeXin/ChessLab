import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { GameType, Side } from '@chesslab/rules-core';
import { CHESS_THEME, XIANGQI_THEME } from '../theme/games';
import { spacing } from '../theme/tokens';

export interface StartConfig {
  gameType: GameType;
  humanSide: Side;
  difficulty: 1 | 2 | 3 | 4 | 5;
}

const DIFF_LABELS = ['入门', '业余', '进阶', '大师', '特级'] as const;

export function HomeScreen(props: {
  onStart(cfg: StartConfig): void;
  onDiagnostics(): void;
}) {
  const [picked, setPicked] = useState<GameType>('xiangqi');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [side, setSide] = useState<Side>('w');

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>棋弈</Text>
        <Text style={styles.brandSub}>CHESS · XIANGqi — 单机对弈</Text>

        <View style={styles.cards}>
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
        </View>

        <Section label="执子">
          <View style={styles.row}>
            <Seg
              label={picked === 'chess' ? '白先' : '红先'}
              active={side === 'w'}
              onPress={() => setSide('w')}
            />
            <Seg
              label={picked === 'chess' ? '黑后' : '黑后'}
              active={side === 'b'}
              onPress={() => setSide('b')}
            />
          </View>
        </Section>

        <Section label="难度">
          <View style={styles.row}>
            {DIFF_LABELS.map((l, i) => (
              <Seg
                key={l}
                label={l}
                active={difficulty === i + 1}
                onPress={() => setDifficulty((i + 1) as 1 | 2 | 3 | 4 | 5)}
              />
            ))}
          </View>
        </Section>

        <Pressable style={styles.startBtn} onPress={() => props.onStart({ gameType: picked, humanSide: side, difficulty })}>
          <Text style={styles.startText}>开始对局</Text>
        </Pressable>

        <Pressable onPress={props.onDiagnostics} hitSlop={8} style={{ padding: spacing.m }}>
          <Text style={{ color: '#B7AD9C', fontSize: 11 }}>引擎诊断 ›</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section(props: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ width: '100%', marginTop: spacing.l }}>
      <Text style={styles.sectionLabel}>{props.label}</Text>
      {props.children}
    </View>
  );
}

function Seg(props: { label: string; active: boolean; onPress(): void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={[styles.seg, props.active && styles.segActive]}
    >
      <Text style={[styles.segText, props.active && styles.segTextActive]}>{props.label}</Text>
    </Pressable>
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
  return (
    <Pressable
      onPress={props.onPress}
      style={[
        styles.card,
        { borderColor: props.active ? t.accent : 'transparent', backgroundColor: t.surface },
      ]}
    >
      <View style={[styles.artBox, { backgroundColor: t.bg }]}>{props.art}</View>
      <Text style={{ color: t.textPrimary, fontWeight: '800', fontSize: 15 }}>{props.title}</Text>
      <Text style={{ color: t.textSecondary, fontSize: 9, letterSpacing: 2 }}>{props.tag}</Text>
    </Pressable>
  );
}

/** Tiny board previews used on the home cards. */
function MiniChessArt() {
  const light = CHESS_THEME.board.lightSquare;
  const dark = CHESS_THEME.board.darkSquare;
  const cells = Array.from({ length: 16 }, (_, i) => (Math.floor(i / 4) + i) % 2 === 0);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 76, borderRadius: 3, overflow: 'hidden' }}>
      {cells.map((isLight, i) => (
        <View key={i} style={{ width: 19, height: 19, backgroundColor: isLight ? light : dark }} />
      ))}
    </View>
  );
}

function MiniXiangqiArt() {
  const t = XIANGQI_THEME;
  return (
    <View
      style={{
        width: 76,
        height: 76,
        backgroundColor: t.board.lightSquare,
        borderWidth: 1,
        borderColor: t.board.line,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: -8 }}>
        <MiniDisc color="#A63A2B" char="帥" />
        <MiniDisc color="#33302A" char="將" />
      </View>
      <Text style={{ color: t.board.riverText ?? '#6B4F2A', fontSize: 9, letterSpacing: 2, marginTop: 10 }}>
        楚河汉界
      </Text>
    </View>
  );
}
function MiniDisc({ color, char }: { color: string; char: string }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#F6E7C8',
        borderWidth: 1.5,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{char}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F1EADC' },
  content: { alignItems: 'center', paddingBottom: spacing.xxl },
  brand: { fontSize: 34, fontWeight: '900', letterSpacing: 10, color: '#33291C', marginTop: spacing.xxl },
  brandSub: { fontSize: 9, letterSpacing: 4, color: '#A2977F', marginTop: 2, marginBottom: spacing.xl },
  cards: { flexDirection: 'row', gap: spacing.m },
  card: {
    width: 150,
    borderRadius: 14,
    borderWidth: 2,
    padding: spacing.m,
    alignItems: 'center',
    gap: spacing.xs,
  },
  artBox: { borderRadius: 8, padding: spacing.s, marginBottom: spacing.xs },
  sectionLabel: {
    alignSelf: 'flex-start',
    fontSize: 10,
    letterSpacing: 2,
    color: '#8A8070',
    marginBottom: spacing.s,
    marginLeft: 2,
  },
  row: { flexDirection: 'row', gap: spacing.s, flexWrap: 'wrap', justifyContent: 'center' },
  seg: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D8CDB8',
    backgroundColor: '#FBF7EE',
  },
  segActive: { borderColor: '#7A5230', backgroundColor: '#E9DCC4' },
  segText: { fontSize: 12, color: '#5C5343' },
  segTextActive: { color: '#4C3418', fontWeight: '700' },
  startBtn: {
    marginTop: spacing.xl,
    backgroundColor: '#33291C',
    paddingHorizontal: 44,
    paddingVertical: 13,
    borderRadius: 999,
  },
  startText: { color: '#F5EDDD', fontWeight: '800', fontSize: 15, letterSpacing: 4 },
});
