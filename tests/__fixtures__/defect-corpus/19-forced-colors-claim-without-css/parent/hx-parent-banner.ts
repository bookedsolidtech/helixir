// @ts-nocheck
import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { styles } from './hx-parent-banner.styles.js';

/**
 * Banner that supports Windows high-contrast (forced-colors) mode.
 *
 * @element hx-parent-banner
 * @forced-colors-supported true
 */
@customElement('hx-parent-banner')
export class HxParentBanner extends LitElement {
  static override styles = styles;

  override render() {
    return html`<slot></slot>`;
  }
}
