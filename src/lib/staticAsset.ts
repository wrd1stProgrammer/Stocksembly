const prefix = (process.env["NEXT_PUBLIC_STATIC_ASSET_BASE_URL"] ?? "").replace(
  /\/$/,
  "",
);

/** Only public office assets are eligible; report and API URLs stay private. */
export function staticAsset(path: string): string {
  if (!prefix || !/^\/research\/office-v(?:7|8|9|10)\//.test(path)) return path;
  return `${prefix}${path}`;
}

export const staticAssetCdnEnabled = prefix.length > 0;
