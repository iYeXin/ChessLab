import React from 'react';
import { themeClassFor, CHESS_THEME } from '../theme/games';
import { TopBar } from '../components/GameChrome';

/**
 * Phase W1 stub — real engine diagnostics arrive with the Tauri engine
 * bridge (Phase W2): spawn/uci/handshake probes per profile.
 */
export function DiagnosticsScreen(props: { onBack(): void }) {
  const theme = CHESS_THEME;
  return (
    <div className={themeClassFor('chess')} style={{ height: '100%', backgroundColor: theme.bg }}>
      <TopBar theme={theme} title="引擎诊断" subtitle="DIAGNOSTICS" onBack={props.onBack} />
      <div style={{ padding: 'var(--sp-xl)', color: theme.textSecondary, fontSize: 13 }}>
        引擎桥（Phase W2）接入后提供：进程 spawn / UCI 握手 / NNUE 加载 / 搜索冒烟 探针。
      </div>
    </div>
  );
}
