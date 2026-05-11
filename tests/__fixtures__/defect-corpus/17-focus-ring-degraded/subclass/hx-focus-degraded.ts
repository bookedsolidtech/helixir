// @ts-nocheck
import { customElement } from 'lit/decorators.js';
import { HxParentTab } from '../parent/hx-parent-tab.js';
import { styles as overrideStyles } from './hx-focus-degraded.styles.js';

/**
 * Subclass that strips the parent's :focus-visible rule entirely.
 *
 * @element hx-focus-degraded
 */
@customElement('hx-focus-degraded')
export class HxFocusDegraded extends HxParentTab {
  static override styles = [HxParentTab.styles, overrideStyles];
}
