import React, { useCallback, useRef, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  Pressable,
  View,
} from 'react-native';
import { UciEngineDriver } from '@chesslab/engine-uci';
import { STOCKFISH_PROFILE, PIKAFISH_PROFILE } from '@chesslab/engine-uci';
import { resolveTransportFactory } from '@chesslab/engine-process';

/**
 * Backend bring-up console (temporary UI).
 * Proves the full chain on device: JS -> native process bridge -> engine
 * binary -> UCI handshake -> search -> bestmove, for both games.
 */

type LogLine = { text: string; kind: 'cmd' | 'info' | 'ok' | 'err' };

export default function App(): React.JSX.Element {
  const [log, setLog] = useState<LogLine[]>([
    { text: 'ChessLab backend console — pick an engine to start.', kind: 'info' },
  ]);
  const [busy, setBusy] = useState(false);
  const driverRef = useRef<UciEngineDriver | null>(null);

  const append = useCallback((text: string, kind: LogLine['kind'] = 'info') => {
    setLog(prev => [...prev.slice(-120), { text, kind }]);
  }, []);

  const run = useCallback(
    async (game: 'chess' | 'xiangqi') => {
      if (busy) return;
      setBusy(true);
      try {
        await driverRef.current?.quit();
        driverRef.current = null;

        append(`\n== starting ${game} engine ==`, 'cmd');
        const factory = await resolveTransportFactory();
        append('transport: resolved');

        // Android resolves the binary inside nativeLibraryDir via our native
        // module; the Node transport (dev/CI) uses absolute paths from env.
        let command: string;
        const args: string[] = [];
        let extraOptions: Record<string, string> = {};
        try {
          const rn = require('react-native');
          const mod = rn.NativeModules.ChessEngines;
          const dir: string = await mod.getNativeLibraryDir();
          const profile = game === 'chess' ? STOCKFISH_PROFILE : PIKAFISH_PROFILE;
          command = `${dir}/lib${profile.binaryName}.so`;
          if (game === 'xiangqi') {
            extraOptions.EvalFile = `${dir}/libpikafish_nnue.so`;
          }
        } catch {
          throw new Error(
            'Native ChessEngines module unavailable. Run on device/emulator; ' +
              'desktop dev should use `pnpm smoke:engines` instead.',
          );
        }

        const profile = game === 'chess' ? STOCKFISH_PROFILE : PIKAFISH_PROFILE;
        const driver = new UciEngineDriver(profile, { debug: l => append(l, 'info') });
        const transport = await factory({ command, args });
        await driver.start(transport);
        append(`handshake OK: ${driver.name}`, 'ok');

        if (Object.keys(extraOptions).length > 0) {
          await driver.setOptions(extraOptions);
          append(`options applied: ${JSON.stringify(extraOptions)}`);
        }
        await driver.newGame();

        // Quick opening probe.
        const startFen =
          game === 'chess'
            ? undefined
            : 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
        const res = await driver.search({ fen: startFen }, { movetimeMs: 600 });
        append(`bestmove after 600ms: ${res.bestmove ?? '(none)'}`, 'ok');

        driverRef.current = driver;
      } catch (err) {
        append(`ERROR: ${String(err)}`, 'err');
      } finally {
        setBusy(false);
      }
    },
    [append, busy],
  );

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <Text style={styles.title}>ChessLab</Text>
      <View style={styles.buttons}>
        <Pressable style={[styles.btn, busy && styles.btnDisabled]} onPress={() => run('chess')}>
          <Text style={styles.btnText}>Start Stockfish</Text>
        </Pressable>
        <Pressable style={[styles.btn, busy && styles.btnDisabled]} onPress={() => run('xiangqi')}>
          <Text style={styles.btnText}>Start Pikafish</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.console}>
        {log.map((l, i) => (
          <Text key={i} style={[styles.line, styles[l.kind]]} selectable>
            {l.text}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#faf7f2' },
  title: { fontSize: 24, fontWeight: '700', marginHorizontal: 16, marginTop: 12 },
  buttons: { flexDirection: 'row', gap: 12, padding: 16 },
  btn: {
    backgroundColor: '#8b0000',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: '600' },
  console: { flex: 1, backgroundColor: '#101418', padding: 10 },
  line: { fontFamily: 'monospace', fontSize: 11, lineHeight: 15 },
  cmd: { color: '#7fd4ff' },
  info: { color: '#c9d1d9' },
  ok: { color: '#7ee787' },
  err: { color: '#ff7b72' },
});
