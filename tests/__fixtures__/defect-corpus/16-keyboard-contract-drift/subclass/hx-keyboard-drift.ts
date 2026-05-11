// @ts-nocheck
import { customElement } from 'lit/decorators.js';
import { HxParentCheckbox } from '../parent/hx-parent-checkbox.js';

/**
 * Subclass that adds an Escape-to-dismiss keydown handler WITHOUT re-declaring
 * the @keyboard-contract. Parent's contract claims activate=Space,Enter but the
 * subclass now also reacts to Escape — parent contract no longer authoritative.
 *
 * @element hx-keyboard-drift
 */
@customElement('hx-keyboard-drift')
export class HxKeyboardDrift extends HxParentCheckbox {
  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('keydown', this._onEscape);
  }

  override disconnectedCallback(): void {
    this.removeEventListener('keydown', this._onEscape);
    super.disconnectedCallback();
  }

  private _onEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.dispatchEvent(new CustomEvent('dismiss', { bubbles: true, composed: true }));
      this.remove();
    }
  };
}
