/** Barrel export for all CEM-native analyzers. */
export { analyzeTypeCoverage, type TypeCoverageResult } from './type-coverage.js';
export { analyzeApiSurface, type ApiSurfaceResult } from './api-surface.js';
export { analyzeCssArchitecture, type CssArchitectureResult } from './css-architecture.js';
export { analyzeEventArchitecture, type EventArchitectureResult } from './event-architecture.js';
export {
  analyzeSourceAccessibility,
  analyzeSourceAccessibilityDeep,
  scanSourceForA11yPatterns,
  scoreSourceMarkers,
  isInteractiveComponent,
  resolveComponentSourceFilePath,
  PATTERNS as SOURCE_A11Y_PATTERNS,
  type SourceA11yMarkers,
  type SourceAccessibilityResult,
  type DeepSourceAccessibilityResult,
} from './source-accessibility.js';
export {
  resolveInheritanceChain,
  type ResolvedSource,
  type InheritanceChainResult,
} from './mixin-resolver.js';
