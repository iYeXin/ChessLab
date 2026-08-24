import React from 'react';
import { themeClassFor, CHESS_THEME } from '../theme/games';
import { TopBar } from '../components/GameChrome';
import { useSettings, type XiangqiFont, type XiangqiTexture, type ChessBoardStyle, type MoveHistoryMode, type XiangqiNotation } from '../state/settings';

export function SettingsScreen(props: { onBack(): void }) {
  const theme = CHESS_THEME; // settings screen uses neutral chess chrome
  const { settings, update, reset } = useSettings();

  return (
    <div className={themeClassFor('chess')} style={{ height: '100%', backgroundColor: '#F1EADC', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopBar theme={theme} title="设置" subtitle="SETTINGS" onBack={props.onBack} />
      <div className="scrollable" style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-l) var(--sp-l)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-l)', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <SettingSection title="对局显示">
          <ToggleRow label="显示可走位置" desc="选中棋子时高亮可落点" value={settings.showLegalTargets} onChange={v => update('showLegalTargets', v)} />
          <ToggleRow label="翻转对方棋子" desc="对方棋子朝向对面（更贴近实物）" value={settings.flipOpponentPieces} onChange={v => update('flipOpponentPieces', v)} />
          <SelectRow<MoveHistoryMode>
            label="着法记录"
            value={settings.moveHistoryMode}
            options={[
              { value: 'hiddenDuringPlay', label: '对局中隐藏，结束后查看' },
              { value: 'compact', label: '精简（仅近5步）' },
              { value: 'always', label: '始终显示' },
            ]}
            onChange={v => update('moveHistoryMode', v)}
          />
        </SettingSection>

        <SettingSection title="国际象棋">
          <SelectRow<ChessBoardStyle>
            label="棋盘质感"
            value={settings.chessBoardStyle}
            options={[
              { value: 'classic', label: '经典' },
              { value: 'polished', label: '精致（优化边框/阴影/坐标）' },
            ]}
            onChange={v => update('chessBoardStyle', v)}
          />
        </SettingSection>

        <SettingSection title="中国象棋">
          <SelectRow<XiangqiFont>
            label="棋子字体"
            value={settings.xiangqiFont}
            options={[
              { value: 'default', label: '默认（黑体）' },
              { value: 'lishu', label: '隶书（内嵌）' },
            ]}
            onChange={v => update('xiangqiFont', v)}
          />
          <SelectRow<XiangqiTexture>
            label="棋盘/棋子质感"
            value={settings.xiangqiTexture}
            options={[
              { value: 'flat', label: '扁平' },
              { value: 'realistic', label: '仿真（木纹/渐变/阴影）' },
            ]}
            onChange={v => update('xiangqiTexture', v)}
          />
          <SelectRow<XiangqiNotation>
            label="记谱方式"
            value={settings.xiangqiNotation}
            options={[
              { value: 'iccs', label: '坐标（h2e2）' },
              { value: 'traditional', label: '传统（兵五进一）' },
            ]}
            onChange={v => update('xiangqiNotation', v)}
          />
        </SettingSection>

        <SettingSection title="观战设置">
          <SelectRow<number>
            label="自动步进延迟"
            value={settings.autoDelayMs}
            options={[
              { value: 0, label: '无延迟' },
              { value: 500, label: '0.5秒' },
              { value: 800, label: '0.8秒' },
              { value: 1200, label: '1.2秒' },
              { value: 2000, label: '2秒' },
            ]}
            onChange={v => update('autoDelayMs', v)}
          />
        </SettingSection>

        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--sp-l) 0' }}>
          <button type="button" onClick={reset} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #D8CDB8', background: '#FBF7EE', color: '#5C5343', fontSize: 12 }}>
            恢复默认
          </button>
        </div>

        <div style={{ textAlign: 'center', color: '#A2977F', fontSize: 10, paddingBottom: 12 }}>
          设置自动保存至本地
        </div>
      </div>
    </div>
  );
}

function SettingSection(props: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#FBF7EE', borderRadius: 12, border: '1px solid #E9DFC8', overflow: 'visible' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #E9DFC8', background: '#F7F3EA', fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#7A5230', borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>{props.title}</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>{props.children}</div>
    </div>
  );
}

function ToggleRow(props: { label: string; desc?: string; value: boolean; onChange(v: boolean): void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #F1EADC' }}>
      <div style={{ flex: 1, paddingRight: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#2A251D' }}>{props.label}</div>
        {props.desc ? <div style={{ fontSize: 10, color: '#8A8070', marginTop: 2 }}>{props.desc}</div> : null}
      </div>
      <button
        type="button"
        onClick={() => props.onChange(!props.value)}
        style={{
          width: 44,
          height: 26,
          borderRadius: 13,
          background: props.value ? '#7A5230' : '#D8CDB8',
          position: 'relative',
          transition: 'background 0.18s',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 3,
            left: props.value ? 20 : 3,
            width: 20,
            height: 20,
            borderRadius: 10,
            background: '#FFF',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            transition: 'left 0.18s',
          }}
        />
      </button>
    </div>
  );
}

function SelectRow<T extends string | number>(props: { label: string; value: T; options: { value: T; label: string }[]; onChange(v: T): void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 14px', borderBottom: '1px solid #F1EADC', gap: 8, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#2A251D' }}>{props.label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minWidth: 0, width: '100%' }}>
        {props.options.map(o => {
          const active = o.value === props.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => props.onChange(o.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: active ? '#7A5230' : '#D8CDB8',
                background: active ? '#E9DCC4' : '#FFF',
                color: active ? '#4C3418' : '#5C5343',
                fontSize: 12,
                fontWeight: active ? 700 : 400,
                maxWidth: '100%',
                wordBreak: 'break-word',
                textAlign: 'center',
                flex: '0 1 auto',
                minWidth: 0,
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
