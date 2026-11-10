/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_TAG_BASE_URL?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

// Web NFC (Chrome Android) — não está no lib.dom do TypeScript.
interface NDEFRecord { recordType: string; data?: DataView; encoding?: string }
interface NDEFReadingEvent extends Event { serialNumber: string; message: { records: NDEFRecord[] } }
declare class NDEFReader extends EventTarget {
  scan(opts?: { signal?: AbortSignal }): Promise<void>;
  onreading: ((e: NDEFReadingEvent) => void) | null;
  onreadingerror: ((e: Event) => void) | null;
}
// BarcodeDetector (Chrome/Android/Safari 17+)
declare class BarcodeDetector {
  constructor(opts?: { formats: string[] });
  static getSupportedFormats(): Promise<string[]>;
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
