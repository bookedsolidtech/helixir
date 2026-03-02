# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in `wc-tools`, please report it privately using one of the following methods:

### Option 1: GitHub Security Advisory (Preferred)

Use GitHub's private vulnerability reporting feature:

1. Go to the [Security tab](https://github.com/bookedsolidtech/wc-tools/security) of this repository
2. Click **"Report a vulnerability"**
3. Fill in the details of the vulnerability

This creates a private advisory visible only to maintainers, allowing us to coordinate a fix before public disclosure.

### Option 2: Email

If you prefer email, send details to the maintainer directly. You can find contact information on the [npm package page](https://www.npmjs.com/package/wc-tools) or by opening a blank GitHub issue requesting a security contact (without disclosing the vulnerability details).

## What to Include

Please include as much of the following information as possible:

- Type of vulnerability (e.g., path traversal, command injection, prototype pollution)
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag, branch, commit, or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability and how an attacker might exploit it

## Response Timeline

- **Acknowledgment**: Within 48 hours of receiving your report
- **Status update**: Within 7 days with an assessment and expected timeline
- **Patch release**: As soon as possible, coordinated with you before public disclosure

## Disclosure Policy

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure). Once a fix is ready:

1. We will notify you before the patch is released
2. We will credit you in the release notes (unless you prefer to remain anonymous)
3. We will publish a GitHub Security Advisory after the fix is deployed

## Scope

This security policy applies to the `wc-tools` package and its direct dependencies. Vulnerabilities in third-party dependencies should be reported to those projects directly, though we appreciate a heads-up if a dependency vulnerability affects `wc-tools` users.
