# Security Policy

## Supported version

Security fixes are applied to the current default branch. Older commits and
third-party forks are not supported by this project.

## Reporting a vulnerability

Do not open a public issue or include sensitive details in discussions. Use
[GitHub private vulnerability reporting](https://github.com/assarasua/magic-brain/security/advisories/new).
Include affected versions, impact, reproduction steps, and a minimal proof of
concept. Remove real credentials and personal data.

Maintainers aim to acknowledge reports within 7 days and provide a status
update within 14 days. Timelines depend on severity and complexity. Please
allow a coordinated fix before disclosure.

## Scope

Useful reports include authentication/session bypasses, cross-user data
access, injection, payment or webhook verification flaws, exposed secrets, and
unsafe deployment defaults. Third-party service availability, social
engineering, and attacks requiring access to your own already-compromised
account are generally out of scope.

If a credential is exposed, revoke or rotate it immediately with its provider;
do not wait for a code fix.
