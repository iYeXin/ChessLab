import React, { useEffect, useState } from 'react';
import { THEME_CLASS, XIANGQI_THEME } from '../theme/games';
import { TopBar } from '../components/GameChrome';
import { invoke } from '@tauri-apps/api/core';
import { createTauriTransport } from '../transport/tauri';
import { PIKAFISH_PROFILE, UciEngineDriver } from '@chessnext/engine-uci';
import { XiangqiRules } from '@chessnext/rules-xiangqi';

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

const ENGINE_ID = 'pikafish';

export function DiagnosticsScreen(props: { onBack(): void }) {
  const theme = XIANGQI_THEME;
  const [pikafish, setPikafish] = useState<ProbeResult>({ engine: 'Pikafish', state: 'idle' });
  const [nnue, setNnue] = useState<string | null>(null);
  const [windowInfo, setWindowInfo] = useState<string>('');

  const runProbe = async () => {
    const t0 = Date.now();
    setPikafish({ engine: 'Pikafish', state: 'running' });
    try {
      const driver = new UciEngineDriver(PIKAFISH_PROFILE);
      const transport = await createTauriTransport(ENGINE_ID);
      await driver.start(transport);
      const name = driver.name || ENGINE_ID;
      const opts = [...driver.availableOptions.keys()];
      let evalFile: string | null = null;
      try {
        evalFile = await invoke<string | null>('engine_nnue_path');
      } catch {}
      if (evalFile) {
        await driver.setOptions({ EvalFile: evalFile }).catch(() => {});
      }
      await driver.newGame();
      const rules = new XiangqiRules();
      const legal = new Set(rules.moves().map(m => m.uci));
      const res = await driver.search({ fen: rules.fen() }, { nodes: 2000 });
      await driver.quit();
      if (!res.bestmove || !legal.has(res.bestmove)) {
        throw new Error(`bestmove ${res.bestmove ?? '(none)'} is not a legal opening move`);
      }
      setPikafish({
        engine: 'Pikafish',
        state: 'ok',
        name,
        options: opts.slice(0, 12),
        bestmove: res.bestmove,
        evalFile,
        durationMs: Date.now() - t0,
      });
    } catch (e) {
      setPikafish({
        engine: 'Pikafish',
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
    await runProbe();
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
    <div className={THEME_CLASS} style={{ height: '100%', backgroundColor: '#F1EADC', display: 'flex', flexDirection: 'column' }}>
      <TopBar theme={theme} title="引擎诊断" subtitle="DIAGNOSTICS" onBack={props.onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-l)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-m)', maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ background: '#F7F3EA', borderRadius: 12, border: '1px solid #E9DFC8', padding: '10px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#A63A2B', marginBottom: 6 }}>系统</div>
          <div style={{ fontSize: 11, color: '#5C5343' }}>窗口：{windowInfo || `${window.innerWidth}x${window.innerHeight}`}</div>
          <div style={{ fontSize: 11, color: '#5C5343' }}>NNUE 路径：{nnue ?? '未找到（将使用内置）'}</div>
        </div>

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
          检测流程：spawn → uci 握手 → 选项 → EvalFile → ucinewgame → 搜索 → 合法着法校验
          <br />
          失败时请检查杀毒软件是否拦截引擎进程
        </div>
      </div>
    </div>
  );
}
