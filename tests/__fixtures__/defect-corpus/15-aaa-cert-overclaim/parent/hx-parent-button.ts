// @ts-nocheck
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styles } from './hx-parent-button.styles.js';

/**
 * Parent button — claims WCAG 2.2 AAA conformance for SC 2.4.13 (Focus Appearance).
 *
 * @element hx-parent-button
 * @aria-pattern button
 * @keyboard-contract activate=Space,Enter; disabled-suppresses=true
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
@customElement('hx-parent-button')
export class HxParentButton extends LitElement {
  static override styles = styles;

  @property({ type: Boolean, reflect: true }) disabled = false;

  override render() {
    return html`<button ?disabled=${this.disabled} part="button">
      <slot></slot>
    </button>`;
  }
}
