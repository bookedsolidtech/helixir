---
'helixir': patch
---

chore: migrate npm publishing to Trusted Publishing (OIDC)

Removes long-lived `NPM_TOKEN` dependency from the publish workflow.
Authentication now happens via GitHub Actions OIDC token federation
(pnpm 9.15.9 has native OIDC trusted-publishing support), in response
to the npm Mini Shai-Hulud token rotation event. Sigstore provenance
attestation preserved. No consumer-facing changes.
