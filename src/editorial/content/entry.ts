import type { EditorialEntryCopy } from "../types";

export function editorialEntry(
  title: string,
  description: string,
  category: string,
  imageAlt: string,
  firstHeading: string,
  firstParagraph: string,
  secondHeading: string,
  secondParagraph: string,
  thirdHeading?: string,
  thirdParagraph?: string,
): EditorialEntryCopy {
  const sections = [
    { heading: firstHeading, paragraphs: [firstParagraph] },
    { heading: secondHeading, paragraphs: [secondParagraph] },
  ];
  if (thirdHeading !== undefined && thirdParagraph !== undefined)
    sections.push({ heading: thirdHeading, paragraphs: [thirdParagraph] });
  return { title, description, category, imageAlt, sections };
}
