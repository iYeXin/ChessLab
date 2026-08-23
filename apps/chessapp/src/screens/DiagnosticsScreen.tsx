import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { UciEngineDriver } from '@chesslab/engine-uci';
import { STOCKFISH_PROFILE, PIKAFISH_PROFILE, spawnSpecFor, platformOptionsFor, shutdownEngines } from '../state/engines';
import { resolveTransportFactory } from '@chesslab/engine-process';
import NativeChessEngines from '../../spec/NativeChessEngines';
import { spacing } from '../theme/tokens';

type LogLine = { text: string; kind: 'cmd' | 'info' | 'ok' | 'err' };

/** Backend bring-up console (kept from the original scaffold). */
export function DiagnosticsScreen(props: { onBack(): void }) {
  const [log, setLog] = useState<LogLine[]>([
    { text: '引擎诊断 — 选择一个引擎开始握手测试。', kind: 'info' },
  ]);
  const [busy, setBusy] = useState(false);

  const append = (text: string, kind: LogLine['kind'] = 'info') =>
    setLog(prev => [...prev.slice(-120), { text, kind }]);

  const run = async (game: 'chess' | 'xiangqi') => {
    if (busy) return;
    setBusy(true);
    try {
      append(`== ${game} 引擎 ==`, 'cmd');
      await shutdownEngines();
      const factory = await resolveTransportFactory(NativeChessEngines);
      const profile = game === 'chess' ? STOCKFISH_PROFILE : PIKAFISH_PROFILE;
      const spec = await spawnSpecFor(profile.id as 'stockfish' | 'pikafish');
      append(`spawn: ${spec.command}`);

      const driver = new UciEngineDriver(profile, { debug: l => append(l) });
      const transport = await factory(spec);
      await driver.start(transport);
      append(`握手 OK：${driver.name}`, 'ok');

      const extra = await platformOptionsFor(profile.id as 'stockfish' | 'pikafish');
      if (Object.keys(extra).length) await driver.setOptions(extra);

      const fen =
        game === 'chess'
          ? undefined
          : 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
      const res = await driver.search({ fen }, { movetimeMs: 600 });
      append(`bestmove: ${res.bestmove ?? '(none)'}`, 'ok');
      await driver.quit();
    } catch (err) {
      append(`ERROR: ${String(err)}`, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#101418' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.m, gap: spacing.m }}>
        <Pressable onPress={props.onBack} hitSlop={8}>
          <Text style={{ color: '#7FD4FF', fontSize: 16 }}>‹ 返回</Text>
        </Pressable>
        <Text style={{ color: '#E6EDF3', fontWeight: '700' }}>引擎诊断</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.m, paddingHorizontal: spacing.l }}>
        {(['chess', 'xiangqi'] as const).map(g => (
          <Pressable
            key={g}
            disabled={busy}
            onPress={() => void run(g)}
            style={{
              backgroundColor: busy ? '#22303C' : '#1B2733',
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 8,
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Text style={{ color: '#7FD4FF', fontWeight: '600' }}>
              {g === 'chess' ? 'Stockfish' : 'Pikafish'}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView style={{ flex: 1, padding: spacing.m }}>
        {log.map((l, i) => (
          <Text
            key={i}
            selectable
            style={{
              fontFamily: undefined,
              fontSize: 11,
              lineHeight: 15,
              color:
                l.kind === 'cmd'
                  ? '#7FD4FF'
                  : l.kind === 'ok'
                    ? '#7EE787'
                    : l.kind === 'err'
                      ? '#FF7B72'
                      : '#C9D1D9',
            }}
          >
            {l.text}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
