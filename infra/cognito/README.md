# Verification email

Production pool: `stocksembly-prod-users` in `us-east-1`.

Applied through the Cognito console on 2026-09-09:
- Branding → Message templates → Verification message
- Verification type: **Code** (unchanged)
- Subject: **Verify your email · Stocksembly**
- HTML body: `verification-email.html` (`{####}` must remain intact)
- SMS template and email delivery configuration unchanged.

This file records the console template; application deployments do not apply it automatically.
The sender remains the Cognito default sender until a verified SES identity is configured.
