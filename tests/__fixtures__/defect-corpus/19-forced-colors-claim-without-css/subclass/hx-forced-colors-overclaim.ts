// @ts-nocheck
import { customElement } from 'lit/decorators.js';
import { HxParentBanner } from '../parent/hx-parent-banner.js';
import { styles as overrideStyles } from './hx-forced-colors-overclaim.styles.js';

/**
 * Subclass that claims forced-colors support in CEM/JSDoc but ships CSS with
 * NO `@media (forced-colors: active)` block — claim vs. evidence mismatch.
 *
 * The subclass REPLACES the parent's styles array (instead of appending) so
 * the parent's forced-colors block is no longer reachable.
 *
 * @element hx-forced-colors-overclaim
 * @forced-colors-supported true
 */
@customElement('hx-forced-colors-overclaim')
export class HxForcedColorsOverclaim extends HxParentBanner {
  static override styles = overrideStyles;
}
