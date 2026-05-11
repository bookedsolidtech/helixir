// @ts-nocheck
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styles } from './hx-parent-tab.styles.js';

/**
 * Tab with AAA-compliant focus ring.
 *
 * @element hx-parent-tab
 * @aria-pattern tab
 * @keyboard-contract activate=Enter,Space; navigate=ArrowLeft,ArrowRight,Home,End; disabled-suppresses=true
 */
@customElement('hx-parent-tab')
export class HxParentTab extends LitElement {
  static override styles = styles;

  @property({ type: Boolean, reflect: true }) selected = false;
  @property({ type: Boolean, reflect: true }) disabled = false;

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute('role', 'tab');
    this.setAttribute('tabindex', this.selected ? '0' : '-1');
  }

  override render() {
    return html`<slot></slot>`;
  }
}
