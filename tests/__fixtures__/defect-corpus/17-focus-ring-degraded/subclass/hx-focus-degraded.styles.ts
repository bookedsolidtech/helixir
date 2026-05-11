// @ts-nocheck
// Subclass override — removes the AAA focus-visible outline entirely.
// Reproduces the regression class addressed by helix commit b011d70f4
// (the 8-component bump to 2px AAA outlines).
import { css } from 'lit';

export const styles = css`
  :host(:focus-visible) {
    outline: none;
  }
`;
