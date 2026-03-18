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
export {
  analyzeSlotArchitecture,
  type SlotArchitectureResult,
  type SlotAnalysis,
  type CoherencePair,
} from './slot-architecture.js';
export {
  analyzeNamingConsistency,
  detectLibraryConventions,
  detectLibraryEventPrefix,
  detectLibraryCssPrefix,
  scoreEventPrefixCoherence,
  scorePropertyNamingConsistency,
  scoreCSSCustomPropertyPrefixing,
  scoreAttributePropertyCoherence,
  type NamingConsistencyResult,
  type LibraryNamingConventions,
} from './naming-consistency.js';
export {
  analyzeCemSourceFidelity,
  extractSourceEvents,
  extractSourceProperties,
  extractSourceObservedAttributes,
  type CemSourceFidelityResult,
  type EventFidelityDetail,
  type PropertyFidelityDetail,
  type AttributeFidelityDetail,
  type SourceProperty,
} from './cem-source-fidelity.js';
