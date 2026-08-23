import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Engine process bridge — codegen TurboModule spec.
 * Kotlin/WinRT implementations extend the codegen-generated base classes.
 */
export interface Spec extends TurboModule {
  /** Desktop (Windows): directory containing engine executables. */
  getEnginesDir(): Promise<string>;
  /** Android: nativeLibraryDir (engines packaged as lib*.so). */
  getNativeLibraryDir(): Promise<string>;
  startEngine(spec: { command: string; args?: string[]; cwd?: string }): Promise<number>;
  writeLine(handle: number, line: string): Promise<void>;
  stopEngine(handle: number): Promise<void>;
  // NativeEventEmitter requirements
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ChessEngines');
