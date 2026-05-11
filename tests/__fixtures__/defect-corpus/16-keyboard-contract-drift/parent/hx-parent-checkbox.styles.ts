// @ts-nocheck
import { css } from 'lit';

export const styles = css`
  :host {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .box {
    width: 16px;
    height: 16px;
    border: 2px solid var(--hx-border, #0f7078);
    border-radius: 2px;
    background: var(--hx-bg, #ffffff);
  }

  :host([checked]) .box {
    background: var(--hx-bg-checked, #0f7078);
  }

  :host(:focus-visible) .box {
    outline: 2px solid var(--hx-focus-ring-color, #0f7078);
    outline-offset: 2px;
  }
`;
