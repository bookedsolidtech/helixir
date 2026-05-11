// @ts-nocheck
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styles } from './hx-parent-field.styles.js';

/**
 * Form-associated input wrapper. Implements the full ElementInternals contract:
 * static formAssociated, attachInternals(), setValidity() updates.
 *
 * @element hx-parent-field
 * @form-associated true
 */
@customElement('hx-parent-field')
export class HxParentField extends LitElement {
  static override styles = styles;
  static formAssociated = true;

  @property({ type: String, reflect: true }) value = '';
  @property({ type: Boolean, reflect: true }) required = false;

  private _internals: ElementInternals;

  constructor() {
    super();
    this._internals = this.attachInternals();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._updateValidity();
  }

  protected _updateValidity(): void {
    const input = this.renderRoot?.querySelector('input') as HTMLInputElement | null;
    if (this.required && !this.value) {
      this._internals.setValidity({ valueMissing: true }, 'Required.', input ?? this);
    } else {
      this._internals.setValidity({});
    }
  }

  protected _onInput = (e: Event): void => {
    this.value = (e.target as HTMLInputElement).value;
    this._updateValidity();
  };

  override render() {
    return html`<input .value=${this.value} ?required=${this.required} @input=${this._onInput} />`;
  }
}
