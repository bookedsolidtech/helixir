// @ts-nocheck
import { css } from 'lit';

export const styles = css`
  :host {
    display: inline-block;
  }

  input {
    font: inherit;
    padding: 6px 8px;
    border: 1px solid var(--hx-border, #0f7078);
    border-radius: 4px;
  }

  :host(:focus-within) input {
    outline: 2px solid var(--hx-focus-ring-color, #0f7078);
    outline-offset: 2px;
  }
`;
