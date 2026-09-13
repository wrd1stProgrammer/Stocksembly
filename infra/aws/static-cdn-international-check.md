# International CDN response check

Measured 2026-09-13 using Globalping public probes. Countries follow the application's supported locales: en-US, ko-KR, ja-JP, zh-TW, es-419 (Mexico as a representative Latin American market), pt-BR, de-DE, and fr-FR. This is one representative country per language, not every country speaking that language.

## Method

The same eight probes were reused by measurement ID for origin and CDN requests, twice each. Target: the identical public office base PNG at release `e78ae1f38eceae2d3b1ef39878d2ca183f77fb33`. All 32 requests returned HTTP 200. No private URLs, credentials, or research data were sent to the measurement service.

Values are medians of two request-start-to-first-byte observations (DNS + TCP + TLS + firstByte), in milliseconds. Globalping returned truncated bodies and near-zero download timings. These values **must not be labeled full image download time, browser rendering time, or page load time**. The probes may be datacenter networks rather than consumer mobile networks. Two samples and one probe per country show basic reachability and latency, not a statistical service-level guarantee.

| Country / probe city | Origin TTFB ms | CDN TTFB ms | Reduction |
| --- | ---: | ---: | ---: |
| US / Los Angeles | 344 | 275 | 20% |
| KR / Chuncheon | 868 | 86 | 90% |
| JP / Tokyo | 772 | 528 | 32% |
| TW / Taipei | 855 | 534 | 38% |
| MX / Queretaro | 748 | 247 | 67% |
| BR / Sao Paulo | 681 | 386 | 43% |
| DE / Falkenstein | 684 | 370 | 46% |
| FR / Roubaix | 560 | 356 | 36% |

The paired medians favored CloudFront in all eight locations. The US and France showed small improvements in the second round, so a blanket promise of a large speedup would be unsupported. Only Korea and Taiwan reported cache hits; the other six locations reported misses on both requests. Repeat does not mean warm-cache, and the test did not establish why those repeated requests remained misses. The selected edge locations were LAX, ICN, NRT, TPE, QRO, GRU, FRA, and CDG.

Full overseas image-transfer and actual browser first/repeat-visit performance were **not measured**. The separate Korean curl and local browser checks in [static-cdn.md](static-cdn.md) cover full-file transfer and scene rendering.

## Reproducible measurement IDs

- Origin: `2WGpP32zWTFCAPvRT000217tx`
- CDN: `2f7MG1ji084rOaGGK000217ty`
- Origin repeat: `2QYBmhRNgSJFupLsK000217u0`
- CDN repeat: `2jbDC5xnMmR0QKh8I000217u0`

Raw responses are saved outside Git in `~/.codex/visualizations/static-cdn-2026-09-13/global-*.json`. Public API results expire; retain local evidence for later comparisons.

Sources: [Globalping](https://globalping.io/), [HTTP measurement schema](https://github.com/jsdelivr/globalping/blob/master/public/v1/components/schemas.yaml).
