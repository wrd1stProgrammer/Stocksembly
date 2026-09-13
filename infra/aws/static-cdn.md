# Public office assets on CloudFront

Status (2026-09-13): the stack is CREATE_COMPLETE. Bucket: `stocksembly-static-cdn-assetbucket-ipc2bmanairw`. Distribution: `E2TJF90S97G3NI`. CDN: `https://d2g12mjth32qmd.cloudfront.net`. Budget creation and the initial public-image upload completed. Delivery is verified for release `e78ae1f38eceae2d3b1ef39878d2ca183f77fb33`. The application changes are validated locally and prepared for PR delivery; they are not yet merged or deployed. The scoped CI upload policy and both repository variables are configured; production still uses the origin until the application PR is merged and deployed.

## Scope and billing

The user authorized pay-as-you-go CloudFront after the sandbox organization denied Pricing Plan Manager access. This configuration uses private S3, CloudFront Origin Access Control, and managed cache/CORS policies. No WAF, paid flat-rate subscription, domain purchase, or credential export is required.

The template includes a USD 10 monthly **notification budget, not a spending cap**. It emails at actual cost above 80% and 100%, and forecast cost above 100%. The budget covers all Amazon CloudFront and Amazon S3 usage in the account, including existing buckets; it is deliberately broader than this distribution. EC2, database, and other service charges are outside this budget. Alerts can lag usage. Applicable free allowances are not a guarantee of a zero bill.

Supply the notification email as the `BudgetEmail` deployment parameter. Never commit a personal email or credentials. CloudFront creation depends on successful budget creation; failed budget permissions must be resolved before proceeding. S3 buckets are retained after stack deletion or rollback and may still incur storage charges.

## Provisioning and activation

1. Deploy `stocksembly-static-cdn.yaml` in us-east-1 with AWS CloudFormation using an authenticated operator session and the BudgetEmail parameter. Inspect stack events if provisioning fails. Do not weaken organization policies.
2. Wait for CREATE_COMPLETE and CloudFront deployment. Record BucketName, DistributionId and CdnOrigin outputs. Confirm the budget and its notification subscribers in AWS Budgets.
3. From the matching Git checkout, run `bash scripts/publish-static-assets.sh BUCKET FULL_GIT_SHA`. Only committed public office assets are archived and uploaded under `/releases/FULL_GIT_SHA/research/`. Untracked files, credentials, and research data are excluded.
4. Verify a representative asset through CloudFront: HTTP 200, image content type, `Cache-Control: public,max-age=31536000,immutable`, CORS allowing the application, and a subsequent cache hit. Compare the returned bytes with the original file.
5. The existing CI deployment role needs ListBucket on this bucket and GetObject/PutObject on its `releases/*` prefix. Review that scoped policy before changing access; no account-wide S3 grant is needed.
6. Set repository Actions variables STATIC_ASSET_BUCKET and STATIC_CDN_ORIGIN only after delivery and upload permissions work. The pipeline uploads before building the app. Use a **new commit** for activation: rerunning a SHA with an existing immutable image does not rebuild it with new variables.
7. Test and release the application through its protected-main PR workflow. Confirm actual image requests in production use the release-prefixed CDN origin. CDN resource creation alone does not activate the application.

## Application behavior and rollback

`NEXT_PUBLIC_STATIC_ASSET_BASE_URL` is a build-time setting containing the CDN origin and release prefix. With no value, the existing local paths remain unchanged. Only office asset paths are eligible. Canvas requests use anonymous CORS and retry the local original if CDN decoding fails. Direct CDN Next Image portraits bypass server optimization; inspect their transferred bytes and load time rather than assuming a performance win.

To stop referencing the CDN, clear both Actions variables and deploy a new application commit. Keep previously published release assets available while old clients can reference them. Deleting old releases or infrastructure is a separate cleanup operation, not part of rollback.

## Required comparison

Use the same committed base image, agent sprites, device, and network for origin and CDN. Record asset byte size, status, time to first byte, total time, and cache response. Repeat several times and report medians, retaining first CDN miss separately from warm edge responses. For browser measurements, compare clean first visits and repeat visits separately and preserve screenshots of the office/portraits. Check that canvas can be exported without a CORS taint. Do not infer a faster first visit from a warm-cache curl alone.

## Deployment role activation

The application EC2 role has no upload access to the new bucket and must remain unchanged. The separate `static-assets-deploy-policy.json` grants the existing GitHub deployment role ListBucket only under `releases/*` and GetObject/PutObject only in that prefix. It grants no delete, ACL, credentials, or access to research data.

From an authenticated AWS operator session, inspect existing policies before attaching this new policy (do not overwrite a different existing policy with this name):

```sh
aws iam list-role-policies --role-name stocksembly-github-deploy
aws iam put-role-policy --role-name stocksembly-github-deploy \
  --policy-name stocksembly-static-assets \
  --policy-document file://infra/aws/static-assets-deploy-policy.json
aws iam get-role-policy --role-name stocksembly-github-deploy \
  --policy-name stocksembly-static-assets
```

This attachment is separate from the existing CICD CloudFormation stack and does not modify its OIDC trust or managed deployment policy. On 2026-09-13, the existing role had only `stocksembly-build-and-deploy`. The new `stocksembly-static-assets` policy was attached through authenticated CloudShell and its exact document was read back successfully. The runtime EC2 role was not changed.

Repository variables `STATIC_ASSET_BUCKET` and `STATIC_CDN_ORIGIN` were set to the bucket and origin above and read back using GitHub CLI. A real upload under the GitHub OIDC role will be exercised by the first merged production deployment; operator-session upload success is not proof of that role's runtime upload.

## Measured comparison (2026-09-13, Korea)

Three fresh curl processes per route and asset, same machine/network and identical SHA-256 bytes. Values are median full transfer times. These are warm-edge asset transfers, not page-render timings or guaranteed worldwide performance.

| Asset | Origin | CloudFront | Reduction |
| --- | ---: | ---: | ---: |
| Office base (2,370,846 bytes) | 2.917 s | 1.344 s | 54% |
| Market sprite (1,749,952 bytes) | 2.543 s | 1.962 s | 23% |
| Workstation table (14,483 bytes) | 0.867 s | 0.123 s | 86% |

CloudFront responses: HTTP 200, `Hit from cloudfront`, `ICN53-P1`, anonymous CORS allowed, one-year immutable cache. The origin uses `max-age=0`. The distribution uses all edge locations. This full-transfer comparison covers Korea only; the separate [eight-country response check](static-cdn-international-check.md) measures overseas response-start latency.

## Browser and code verification

The actual office calibration surface was opened at `http://localhost:3198/showcase/office-calibration` using a production build configured with the release-prefixed CDN URL. All 16 office resources used CloudFront. The scene rendered and advanced from briefing at tick 0 to parallel work at tick 200. Canvas export succeeded without CORS taint.

On the initial observed browser load, individual image resource durations ranged from 1.112 to 1.835 seconds. On reload they ranged from 0.003 to 0.740 seconds. This browser was not reset to a completely empty cache (the base image had been viewed earlier); these are observed load/reload timings, not a controlled cold-first-visit claim. Image decode/render time is not included in Resource Timing durations.

- Three focused tests passed: disabled CDN, published-version-only mapping, and local fallback on CDN failure.
- Worker builds passed. The default Next/Turbopack build could not use this isolated worktree's external node_modules symlink. `next build --webpack` passed including TypeScript and route generation. CI uses installed dependencies rather than that local symlink; its normal Turbopack build remains a PR check.
- The CDN URL was present in compiled browser chunks.
- Shell syntax, help, invalid input rejection, YAML parsing, and diff whitespace checks passed.
- Scoped CI role permission and repository variables are configured. Production activation still requires the protected-main PR and its deployment checks.

Raw local comparison evidence is retained outside Git under `~/.codex/visualizations/static-cdn-2026-09-13/comparison.json`.

## References

- [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/)
- [AWS Budgets resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-budgets-budget.html)
- [AWS Budgets pricing](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/)
- [Managed response headers policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-response-headers-policies.html)

## Canvas CORS and transfer size correction (2026-09-13)

Canvas images use anonymous CORS. The managed response policy only attaches CORS headers to Origin-bearing requests, allowing browser image-cache reuse to encounter a response without the required header. A viewer-response CloudFront Function consistently adds `Access-Control-Allow-Origin: *` and `Timing-Allow-Origin: *` to the existing public-image distribution. S3 remains private and the origin scope excludes application APIs and report data. CloudFront rejects CORS headers inside a response policy's CustomHeadersConfig; use the checked-in function implementation.

The 16 active office PNGs total 21,816,361 bytes. `pnpm assets:office` creates WebP derivatives with unchanged dimensions and full alpha quality, totaling 1,869,742 bytes for the current assets. Development, application builds and CDN publication regenerate derivatives from the original PNGs. Publication uses an archive of the exact release commit, and the original PNG remains the decoder/network fallback. Generated WebP files are not committed.

Production browser checks after the CORS correction showed all 16 images loading from CloudFront with no original-server fallback. The remaining 8–10 second cold transfer was attributable to the approximately 22MB payload, so the WebP client/build change is also required. Preserve immutable release prefixes; do not overwrite original PNG objects to apply this optimization.

Production verification after WebP rollout: a Chrome run with browser cache disabled loaded all 16 WebP images from CloudFront in a 1.45-second transfer window (1.87MB payload), with `data-office-ready=true`, no origin fallback and no console errors. Before WebP, the same office transferred PNGs in 8.5–10.2 seconds. These are image-download timings from the Korean test connection, not a global guarantee or total page-load measurement. Visual inspection confirmed the office and animated characters rendered correctly. The active release received the optimized objects and a backed-up runtime asset-reference correction; merge this source change to preserve it across deployments.
