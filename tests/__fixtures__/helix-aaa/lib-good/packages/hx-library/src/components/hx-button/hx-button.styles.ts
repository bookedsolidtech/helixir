import { css } from 'lit';

export const buttonStyles = css`
  .button:focus-visible {
    outline: var(--hx-focus-ring-width, 2px) solid var(--hx-focus-ring-color, blue);
    outline-offset: var(--hx-focus-ring-offset, 2px);
  }

  @media (forced-colors: active) {
    .button {
      outline: 2px solid CanvasText;
    }
  }
`;
