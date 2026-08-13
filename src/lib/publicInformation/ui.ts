import type { Locale } from "../i18n";

type PublicInformationUi = Readonly<{
  backHome: string;
  chooseLanguage: string;
  contents: string;
  lastUpdated: string;
  related: string;
  contact: string;
  contactDescription: string;
  rights: string;
}>;

export const publicInformationUi: Readonly<
  Record<Locale, PublicInformationUi>
> = {
  en: {
    backHome: "Back to home",
    chooseLanguage: "Choose language",
    contents: "On this page",
    lastUpdated: "Last updated",
    related: "Research standards",
    contact: "Contact",
    contactDescription:
      "Questions about our research process or a published report can be sent to",
    rights: "SERN. All rights reserved.",
  },
  ko: {
    backHome: "홈으로 돌아가기",
    chooseLanguage: "언어 선택",
    contents: "페이지 목차",
    lastUpdated: "최종 업데이트",
    related: "리서치 운영 기준",
    contact: "문의",
    contactDescription:
      "리서치 과정이나 공개 보고서에 관한 문의는 다음 이메일로 보내주세요:",
    rights: "SERN. All rights reserved.",
  },
};
