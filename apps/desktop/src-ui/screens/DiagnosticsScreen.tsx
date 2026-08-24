import React, { useEffect, useState } from 'react';
import { themeClassFor, CHESS_THEME } from '../theme/games';
import { TopBar } from '../components/GameChrome';
import { invoke } from '@tauri-apps/api/core';
import { createTauriTransport } from '../transport/tauri';
import { UciEngineDriver, getProfile } from '@chesslab/engine-uci';

type ProbeState = 'idle' | 'running' | 'ok' | 'fail';
interface ProbeResult {
  engine: string;
  state: ProbeState;
  name?: string;
  options?: string[];
  bestmove?: string | null;
  evalFile?: string | null;
  error?: string;
  durationMs?: number;
}

export function DiagnosticsScreen(props: { onBack(): void }) {
  const theme = CHESS_THEME;
  const [stockfish, setStockfish] = useState<ProbeResult>({ engine: 'Stockfish', state: 'idle' });
  const [pikafish, setPikafish] = useState<ProbeResult>({ engine: 'Pikafish', state: 'idle' });
  const [nnue, setNnue] = useState<string | null>(null);
  const [windowInfo, setWindowInfo] = useState<string>('');

  const runProbe = async (profileId: 'stockfish' | 'pikafish', setter: (r: ProbeResult) => void) => {
    const t0 = Date.now();
    setter({ engine: profileId === 'stockfish' ? 'Stockfish' : 'Pikafish', state: 'running' });
    try {
      const profile = getProfile(profileId);
      const driver = new UciEngineDriver(profile);
      const transport = await createTauriTransport(profileId);
      await driver.start(transport);
      const name = driver.name || profileId;
      const opts = [...driver.availableOptions.keys()];
      // NNUE check for pikafish
      let evalFile: string | null = null;
      if (profileId === 'pikafish') {
        try {
          evalFile = await invoke<string | null>('engine_nnue_path');
        } catch {}
        if (evalFile) {
          await driver.setOptions({ EvalFile: evalFile }).catch(() => {});
        }
      }
      await driver.newGame();
      const fen = profileId === 'stockfish' ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' : 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
      const res = await driver.search({ fen }, { nodes: profileId === 'stockfish' ? 8000 : 2000 });
      await driver.quit();
      setter({
        engine: profileId === 'stockfish' ? 'Stockfish' : 'Pikafish',
        state: 'ok',
        name,
        options: opts.slice(0, 12),
        bestmove: res.bestmove,
        evalFile,
        durationMs: Date.now() - t0,
      });
    } catch (e) {
      setter({
        engine: profileId === 'stockfish' ? 'Stockfish' : 'Pikafish',
        state: 'fail',
        error: String(e),
        durationMs: Date.now() - t0,
      });
    }
  };

  const runAll = async () => {
    setWindowInfo(`${window.innerWidth}x${window.innerHeight} @ ${window.devicePixelRatio}x`);
    try {
      const p = await invoke<string | null>('engine_nnue_path');
      setNnue(p);
    } catch {
      setNnue(null);
    }
    await Promise.all([runProbe('stockfish', setStockfish), runProbe('pikafish', setPikafish)]);
  };

  useEffect(() => {
    void runAll();
  }, []);

  const Card = (r: ProbeResult) => (
    <div style={{ background: '#FBF7EE', borderRadius: 12, border: '1px solid #E9DFC8', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, color: '#2A251D', fontSize: 13 }}>{r.engine}</span>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: r.state === 'ok' ? '#E6F0E6' : r.state === 'fail' ? '#FBE9E7' : r.state === 'running' ? '#FFF3E0' : '#F1EADC', color: r.state === 'ok' ? '#2E7D32' : r.state === 'fail' ? '#C62828' : '#8A8070' }}>
          {r.state === 'idle' ? '待命' : r.state === 'running' ? '检测中…' : r.state === 'ok' ? '正常' : '失败'}
        </span>
      </div>
      {r.name ? <div style={{ fontSize: 11, color: '#5C5343' }}>引擎：{r.name}</div> : null}
      {r.evalFile ? <div style={{ fontSize: 10, color: '#8A8070', wordBreak: 'break-all' }}>EvalFile: {r.evalFile}</div> : null}
      {r.options ? <div style={{ fontSize: 10, color: '#8A8070' }}>Options: {r.options.join(', ')}{r.options.length >= 12 ? ' …' : ''}</div> : null}
      {r.bestmove !== undefined ? <div style={{ fontSize: 11, color: '#2A251D' }}>测试着法：{r.bestmove ?? '(无)'}{r.durationMs ? ` · ${r.durationMs}ms` : ''}</div> : null}
      {r.error ? <div style={{ fontSize: 11, color: '#C62828', whiteSpace: 'pre-wrap' }}>{r.error}</div> : null}
    </div>
  );

  return (
    <div className={themeClassFor('chess')} style={{ height: '100%', backgroundColor: '#F1EADC', display: 'flex', flexDirection: 'column' }}>
      <TopBar theme={theme} title="引擎诊断" subtitle="DIAGNOSTICS" onBack={props.onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-l)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-m)', maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ background: '#F7F3EA', borderRadius: 12, border: '1px solid #E9DFC8', padding: '10px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7A5230', marginBottom: 6 }}>系统</div>
          <div style={{ fontSize: 11, color: '#5C5343' }}>窗口：{windowInfo || `${window.innerWidth}x${window.innerHeight}`}</div>
          <div style={{ fontSize: 11, color: '#5C5343' }}>NNUE 路径：{nnue ?? '未找到（将使用内置）'}</div>
          <div style={{ fontSize: 10, color: '#8A8070', marginTop: 4 }}>Tauri 2 · WebView2 · Rust engines.rs</div>
        </div>

        {Card(stockfish)}
        {Card(pikafish)}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 8 }}>
          <button type="button" onClick={() => void runAll()} style={{ padding: '8px 16px', borderRadius: 999, background: '#33291C', color: '#F5EDDD', fontSize: 12, fontWeight: 700 }}>
            重新检测
          </button>
          <button type="button" onClick={props.onBack} style={{ padding: '8px 16px', borderRadius: 999, border: '1px solid #D8CDB8', background: '#FBF7EE', color: '#5C5343', fontSize: 12 }}>
            返回
          </button>
        </div>

        <div style={{ fontSize: 10, color: '#A2977F', textAlign: 'center', lineHeight: 1.6 }}>
          检测流程：spawn → uci 握手 → 选项 → EvalFile → ucinewgame → 搜索
          <br />
          失败时请检查杀毒软件是否拦截引擎进程
        </div>
      </div>
    </div>
  );
}
