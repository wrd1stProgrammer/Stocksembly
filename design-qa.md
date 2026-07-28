# Authentication UI design QA

## References

- Sign in: `/var/folders/r7/cmvt6v654cj5czmy6wfydb880000gn/T/codex-clipboard-83ecf329-704a-4f55-a691-c53b597bd07b.png`
- Sign up: `/var/folders/r7/cmvt6v654cj5czmy6wfydb880000gn/T/codex-clipboard-4295ed26-7ea8-4835-af6c-2e450fd07210.png`

## Implementation renders

- Sign in: `/Users/minsikchae/projects/Stocksembly/.artifacts/auth/login-2048.png`
- Sign up: `/Users/minsikchae/projects/Stocksembly/.artifacts/auth/signup-2048.png`
- Viewport: 2048 × 1048, desktop, dark appearance

## Comparison

- Composition: centered single-card layout, reference-matched 532 px desktop card width.
- Sign-in geometry: implementation card at x=758, y=243, width=532, matching the supplied reference within a few pixels.
- Typography and spacing: heading, subtitle, provider button, divider, fields, primary action, and footer preserve the reference hierarchy and density.
- Color adaptation: reference green is intentionally replaced with Stocksembly blue; neutrals remain near-black and low-contrast gray.
- Responsive behavior: the card becomes full-width with reduced padding below 640 px.
- Functional states: password visibility, disabled submit, loading, validation notices, confirmation, password reset, OAuth callback, session detection, and sign-out are represented.
