// @ts-nocheck
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styles } from './hx-parent-checkbox.styles.js';

/**
 * Parent checkbox following APG checkbox pattern.
 *
 * @element hx-parent-checkbox
 * @aria-pattern checkbox
 * @keyboard-contract activate=Space,Enter; disabled-suppresses=true
 */
@customElement('hx-parent-checkbox')
export class HxParentCheckbox extends LitElement {
  static override styles = styles;

  @property({ type: Boolean, reflect: true }) checked = false;
  @property({ type: Boolean, reflect: true }) disabled = false;

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute('role', 'checkbox');
    this.setAttribute('tabindex', '0');
    this.addEventListener('keydown', this._onKeydown);
  }

  override disconnectedCallback(): void {
    this.removeEventListener('keydown', this._onKeydown);
    super.disconnectedCallback();
  }

  private _onKeydown = (event: KeyboardEvent): void => {
    if (this.disabled) return;
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      this.checked = !this.checked;
      this.setAttribute('aria-checked', String(this.checked));
      this.dispatchEvent(new CustomEvent('change', { bubbles: true, composed: true }));
    }
  };

  override render() {
    return html`<span class="box" part="box"></span><slot></slot>`;
  }
}
