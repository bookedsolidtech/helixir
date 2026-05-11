// @ts-nocheck
// Parent banner — claims and implements forced-colors support.
// Derived from helix M5 verify-extension defect class 06 (forced-colors).
import { css } from 'lit';

export const styles = css`
  :host {
    display: block;
    padding: 12px 16px;
    background: var(--hx-bg, #f5f8f8);
    color: var(--hx-fg, #0f1f1f);
    border-left: 4px solid var(--hx-accent, #0f7078);
  }

  :host(:focus-visible) {
    outline: 2px solid var(--hx-focus-ring-color, #0f7078);
    outline-offset: 2px;
  }

  @media (forced-colors: active) {
    :host {
      background: Canvas;
      color: CanvasText;
      border-left: 4px solid LinkText;
      forced-color-adjust: none;
    }
    :host(:focus-visible) {
      outline: 2px solid CanvasText;
    }
  }
`;
