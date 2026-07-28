declare module "pdfmake" {
  import type { TDocumentDefinitions } from "pdfmake/interfaces";

  type FontDescriptor = {
    readonly normal: string;
    readonly bold: string;
    readonly italics: string;
    readonly bolditalics: string;
  };

  interface PdfKitDocument extends NodeJS.ReadableStream {
    end(): void;
  }

  export default class PdfPrinter {
    constructor(fonts: Readonly<Record<string, FontDescriptor>>);
    createPdfKitDocument(
      definition: TDocumentDefinitions,
      options?: Readonly<Record<string, unknown>>,
    ): PdfKitDocument;
  }
}
