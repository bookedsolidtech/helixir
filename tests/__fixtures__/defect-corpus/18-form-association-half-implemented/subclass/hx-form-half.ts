// @ts-nocheck
import { customElement } from 'lit/decorators.js';
import { HxParentField } from '../parent/hx-parent-field.js';

/**
 * Subclass that re-asserts `static formAssociated = true` but overrides the
 * constructor without calling `attachInternals()`, and removes the parent's
 * `_updateValidity()` implementation. Form association is half-implemented.
 *
 * @element hx-form-half
 * @form-associated true
 */
@customElement('hx-form-half')
export class HxFormHalf extends HxParentField {
  static override formAssociated = true;

  constructor() {
    super();
    // Intentionally NOT calling this.attachInternals(); — the defect.
  }

  // Intentionally overrides parent _updateValidity with a no-op — the defect.
  protected override _updateValidity(): void {
    // no-op: never calls _internals.setValidity()
  }
}
