// @ts-nocheck
// Subclass CSS — overrides parent focus ring to 1px solid #888.
// Cert claim still asserts SC 2.4.13 conformance, but evidence no longer
// matches the 2px outline contract.
import { css } from 'lit';

export const styles = css`
  button:focus-visible {
    outline: 1px solid #888;
    outline-offset: 0;
  }
`;
