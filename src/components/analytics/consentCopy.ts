import type { AppLocale } from "../../lib/supportedLocales";

type ConsentCopy = Readonly<{
  title: string;
  description: string;
  accept: string;
  reject: string;
}>;

export const consentCopy = {
  en: {
    title: "Optional analytics",
    description:
      "We store signup referral information to identify acquisition sources. With your consent, we also use Google Analytics and Meta to measure usage and advertising conversions. Rejecting does not affect essential login cookies.",
    accept: "Accept",
    reject: "Reject",
  },
  ko: {
    title: "서비스 개선을 위한 분석",
    description:
      "가입 유입 경로는 출처 확인을 위해 저장됩니다. 동의하면 Google Analytics와 Meta로 사용 흐름과 광고 전환을 측정합니다. 거절해도 필수 로그인 쿠키에는 영향이 없습니다.",
    accept: "동의",
    reject: "거절",
  },
  ja: {
    title: "任意のアクセス解析",
    description:
      "登録時の流入元情報を保存します。同意した場合、Google AnalyticsとMetaで利用状況と広告コンバージョンも測定します。拒否してもログインに必要なCookieには影響しません。",
    accept: "同意する",
    reject: "拒否する",
  },
  "zh-TW": {
    title: "選用分析",
    description:
      "我們會儲存註冊來源資訊。經您同意後，也會使用Google Analytics與Meta衡量使用情況和廣告轉換。拒絕不會影響必要的登入Cookie。",
    accept: "同意",
    reject: "拒絕",
  },
  es: {
    title: "Analítica opcional",
    description:
      "Guardamos la fuente de referencia del registro. Con tu consentimiento también usamos Google Analytics y Meta para medir el uso y las conversiones publicitarias. Rechazar no afecta a las cookies necesarias para iniciar sesión.",
    accept: "Aceptar",
    reject: "Rechazar",
  },
  "pt-BR": {
    title: "Análise opcional",
    description:
      "Armazenamos a origem do cadastro. Com seu consentimento, também usamos Google Analytics e Meta para medir o uso e as conversões de anúncios. Recusar não afeta os cookies essenciais de login.",
    accept: "Aceitar",
    reject: "Recusar",
  },
  de: {
    title: "Optionale Analyse",
    description:
      "Wir speichern die Herkunft der Registrierung. Mit deiner Zustimmung messen Google Analytics und Meta auch Nutzung und Werbeconversions. Eine Ablehnung beeinträchtigt notwendige Login-Cookies nicht.",
    accept: "Zustimmen",
    reject: "Ablehnen",
  },
  fr: {
    title: "Analyse facultative",
    description:
      "Nous enregistrons la source de votre inscription. Avec votre accord, Google Analytics et Meta mesurent aussi l’utilisation et les conversions publicitaires. Refuser n’affecte pas les cookies indispensables à la connexion.",
    accept: "Accepter",
    reject: "Refuser",
  },
} satisfies Record<AppLocale, ConsentCopy>;
