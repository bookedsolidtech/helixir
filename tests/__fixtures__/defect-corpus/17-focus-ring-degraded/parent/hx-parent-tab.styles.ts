// @ts-nocheck
// Parent tab — AAA-compliant 2px focus-visible outline per helix commit b011d70f4.
import { css } from 'lit';

export const styles = css`
  :host {
    display: inline-block;
    padding: 8px 16px;
    cursor: pointer;
  }

  :host([selected]) {
    background: var(--hx-bg-selected, #0f7078);
    color: var(--hx-fg-selected, #ffffff);
  }

  :host(:focus-visible) {
    outline: 2px solid var(--hx-focus-ring-color, #0f7078);
    outline-offset: 2px;
  }
`;
