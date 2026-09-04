type MetaEnvironment = {
  readonly [key: string]: string | undefined;
  readonly META_PIXEL_ID?: string;
  readonly NEXT_PUBLIC_META_PIXEL_ID?: string;
};

export function resolveMetaPixelId(
  environment: MetaEnvironment = process.env,
): string | undefined {
  for (const candidate of [
    environment.META_PIXEL_ID,
    environment.NEXT_PUBLIC_META_PIXEL_ID,
  ]) {
    const pixelId = candidate?.trim();
    if (/^\d+$/u.test(pixelId ?? "")) {
      return pixelId;
    }
  }

  return undefined;
}
