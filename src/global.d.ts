import type { FrameMeter } from './lib/perf.js'

declare global {
  interface Window {
    __auroraMeter: FrameMeter
    __scanlineMode: 'rows' | 'pattern'
    __resetAuroraMeter: () => void
  }
}
