import type { FrameMeter } from './lib/perf.js'

declare global {
  interface Window {
    __auroraMeter: FrameMeter
    __particleMeter: FrameMeter
    __cursorMeter: FrameMeter
    __scanlineMode: 'rows' | 'pattern'
    __resetAuroraMeter: () => void
    __resetParticleMeter: () => void
    __resetCursorMeter: () => void
  }
}
