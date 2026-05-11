// @ts-nocheck
// Subclass replaces the parent's forced-colors block with nothing.
// The cascade order [parent.styles, override.styles] means the empty
// override below does NOT remove the parent rule — so the subclass
// instead REPLACES the styles array entirely (see hx-forced-colors-overclaim.ts).
// This file holds the visible (non-forced-colors) override only.
import { css } from 'lit';

export const styles = css`
  :host {
    display: block;
    padding: 12px 16px;
    background: #f5f8f8;
    color: #0f1f1f;
    border-left: 4px solid #0f7078;
  }

  :host(:focus-visible) {
    outline: 2px solid #0f7078;
    outline-offset: 2px;
  }
  /* No @media (forced-colors: active) block — claim/evidence mismatch. */
`;
