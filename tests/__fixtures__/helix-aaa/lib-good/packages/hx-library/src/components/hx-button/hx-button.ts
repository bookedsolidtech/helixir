// Fixture: helix-button source with the full AAA contract surface.
import { LitElement } from 'lit';

export class HxButton extends LitElement {
  static override formAssociated = true;

  private _internals = this.attachInternals();

  override updated(): void {
    this._internals.setValidity({});
  }
}
