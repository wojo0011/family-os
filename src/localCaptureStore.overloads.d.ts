import type { CaptureKind } from './localCaptureStore';
import './localCaptureStore';

declare module './localCaptureStore' {
  /**
   * Capture forms may attach optional adapter metadata (for example originKey)
   * alongside validated user fields. Runtime normalization already converts
   * undefined metadata to an empty string before persistence.
   */
  export function addCaptureRecord(
    kind: CaptureKind,
    rawValues: Record<string, string | undefined>,
  ): {
    record: import('./localCaptureStore').CaptureRecord | null;
    validation: import('./localCaptureStore').CaptureValidationResult;
  };
}
