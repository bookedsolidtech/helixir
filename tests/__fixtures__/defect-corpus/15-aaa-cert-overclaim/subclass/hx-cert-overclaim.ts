// @ts-nocheck
import { customElement } from 'lit/decorators.js';
import { HxParentButton } from '../parent/hx-parent-button.js';
import { styles as overrideStyles } from './hx-cert-overclaim.styles.js';

/**
 * Subclass that inherits the parent's AAA cert claim via superclass but
 * degrades the focus-ring to 1px — breaking SC 2.4.13 while still asserting
 * the cert criterion.
 *
 * @element hx-cert-overclaim
 *
 * @helix-meta {
 *   "aaa": {
 *     "certified": true,
 *     "certifiedDate": "2025-11-14",
 *     "criteria": ["1.4.11", "2.4.7", "2.4.11", "2.4.13"],
 *     "auditUrl": "https://audits.helix.dev/hx-parent-button/aaa-2025-11"
 *   }
 * }
 */
@customElement('hx-cert-overclaim')
export class HxCertOverclaim extends HxParentButton {
  static override styles = [HxParentButton.styles, overrideStyles];
}
