// @ts-nocheck
// Parent CSS — AAA-compliant 2px focus ring per SC 2.4.13.
// Derived from helix commit e54e069ff focus-ring contract.
import { css } from 'lit';

export const styles = css`
  :host {
    display: inline-block;
  }

  button {
    background: var(--hx-bg, #0f7078);
    color: var(--hx-fg, #ffffff);
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 8px 16px;
    font: inherit;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid var(--hx-focus-ring-color, #0f7078);
    outline-offset: 2px;
  }

  @media (forced-colors: active) {
    button:focus-visible {
      outline: 2px solid CanvasText;
    }
  }
`;
