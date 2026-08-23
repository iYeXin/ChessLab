import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface EngineManifest {
  stockfishPath: string | null;
  pikafishPath: string | null;
  pikafishNnuePath: string | null;
}

/**
 * Reads third_party/engines/.engines.json produced by fetch-engines.ps1.
 * Returns nulls (not errors) when nothing has been fetched yet.
 */
export function parseManifest(): EngineManifest {
  const manifestPath = join(process.cwd(), 'third_party', 'engines', '.engines.json');
  if (!existsSync(manifestPath)) {
    return { stockfishPath: null, pikafishPath: null, pikafishNnuePath: null };
  }
  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as Partial<EngineManifest>;
    return {
      stockfishPath: raw.stockfishPath ?? null,
      pikafishPath: raw.pikafishPath ?? null,
      pikafishNnuePath: raw.pikafishNnuePath ?? null,
    };
  } catch {
    return { stockfishPath: null, pikafishPath: null, pikafishNnuePath: null };
  }
}
