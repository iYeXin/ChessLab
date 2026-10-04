import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface EngineManifest {
  pikafishPath: string | null;
  pikafishNnuePath: string | null;
}

const EMPTY: EngineManifest = { pikafishPath: null, pikafishNnuePath: null };

/**
 * Reads third_party/engines/.engines.json produced by fetch-engines.ps1.
 * Returns nulls (not errors) when nothing has been fetched yet.
 */
export function parseManifest(): EngineManifest {
  const manifestPath = join(process.cwd(), 'third_party', 'engines', '.engines.json');
  if (!existsSync(manifestPath)) return EMPTY;
  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as Partial<EngineManifest>;
    return {
      pikafishPath: raw.pikafishPath ?? null,
      pikafishNnuePath: raw.pikafishNnuePath ?? null,
    };
  } catch {
    return EMPTY;
  }
}
