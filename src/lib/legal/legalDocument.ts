export type LegalSection = {
  readonly title: string;
  readonly paragraphs?: readonly string[];
  readonly bullets?: readonly string[];
};

export type LegalDocument = {
  readonly title: string;
  readonly description: string;
  readonly updated: string;
  readonly notice: string;
  readonly sections: readonly LegalSection[];
};
