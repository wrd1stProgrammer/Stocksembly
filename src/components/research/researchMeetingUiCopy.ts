import type { AppLocale } from "../../lib/i18n";

type Group =
  | "collection"
  | "individual"
  | "team"
  | "debate"
  | "audit"
  | "committee";

type ConversationGroup = "team" | "debate" | "committee";

type MeetingUiCopy = {
  readonly minutes: string;
  readonly meetingLog: string;
  readonly chat: string;
  readonly rightPanelView: string;
  readonly rightPanel: string;
  readonly collapsePanel: string;
  readonly expandPanel: string;
  readonly chatAfterComplete: string;
  readonly cancelling: string;
  readonly cancelResearch: string;
  readonly cancelFailed: string;
  readonly researchSetup: string;
  readonly setupBody: string;
  readonly chatHistory: string;
  readonly originalBrief: string;
  readonly followUp: string;
  readonly researchChair: string;
  readonly cancelled: string;
  readonly incomplete: string;
  readonly terminalBody: string;
  readonly startingRecovery: string;
  readonly resume: string;
  readonly retryUnavailable: string;
  readonly retryForbidden: string;
  readonly retryMissing: string;
  readonly retryFailed: string;
  readonly newUpdates: (count: number) => string;
  readonly groups: Readonly<Record<Group, string>>;
  readonly conversations: Readonly<Record<ConversationGroup, string>>;
};

const en: MeetingUiCopy = {
  minutes: "Meeting minutes",
  meetingLog: "Meeting log",
  chat: "Chat",
  rightPanelView: "Right panel view",
  rightPanel: "Right panel",
  collapsePanel: "Collapse right panel",
  expandPanel: "Expand right panel",
  chatAfterComplete: "Available after the research is complete",
  cancelling: "Cancelling",
  cancelResearch: "Cancel",
  cancelFailed:
    "The cancellation request could not be processed. Try again shortly.",
  researchSetup: "Research setup",
  setupBody:
    "Connecting the research team and evidence collection. New records will appear here as they are prepared.",
  chatHistory: "Chat history",
  originalBrief: "Original brief",
  followUp: "Follow-up",
  researchChair: "Research chair",
  cancelled: "Research cancelled",
  incomplete: "Research could not be completed",
  terminalBody:
    "Finished stages were preserved and no research credit was charged. You can resume from the affected stage using the same evidence snapshot.",
  startingRecovery: "Starting recovery",
  resume: "Resume failed stage",
  retryUnavailable:
    "This run has no resumable failed stage. Start a new research run.",
  retryForbidden:
    "This research is already recovering or complete. Refresh to see its current state.",
  retryMissing:
    "The research could not be found. Reopen it from your research list.",
  retryFailed: "The recovery request failed. Please try again shortly.",
  newUpdates: (count) => `${count} new update${count === 1 ? "" : "s"}`,
  groups: {
    collection: "Evidence setup",
    individual: "Independent research",
    team: "Team synthesis",
    debate: "Cross-team debate",
    audit: "Evidence audit",
    committee: "Final committee",
  },
  conversations: {
    team: "joint synthesis",
    debate: "challenge and rebuttal",
    committee: "committee review",
  },
};

export const researchMeetingUiCopy: Readonly<Record<AppLocale, MeetingUiCopy>> =
  {
    en,
    ko: {
      ...en,
      minutes: "회의록",
      meetingLog: "회의록",
      chat: "채팅",
      rightPanelView: "우측 패널 보기",
      rightPanel: "우측 패널",
      collapsePanel: "우측 패널 접기",
      expandPanel: "우측 패널 펼치기",
      chatAfterComplete: "리서치 완료 후 이용할 수 있습니다",
      cancelling: "취소 중",
      cancelResearch: "분석 취소",
      cancelFailed:
        "취소 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      researchSetup: "리서치 준비",
      setupBody:
        "분석팀과 근거 수집 작업을 연결하고 있습니다. 준비되는 기록부터 여기에 바로 표시됩니다.",
      chatHistory: "채팅 기록",
      originalBrief: "원 질문",
      followUp: "후속 질문",
      researchChair: "리서치 의장",
      cancelled: "분석 취소됨",
      incomplete: "리서치를 완성하지 못했습니다",
      terminalBody:
        "완료된 단계는 보존되며 리서치 크레딧은 차감되지 않습니다. 같은 데이터 기준으로 실패한 단계부터 다시 진행할 수 있습니다.",
      startingRecovery: "복구 시작 중",
      resume: "실패 단계부터 다시 진행",
      retryUnavailable:
        "이어갈 수 있는 실패 단계가 없습니다. 새 리서치를 시작해 주세요.",
      retryForbidden:
        "이미 복구 중이거나 완료된 리서치입니다. 새로고침해 상태를 확인해 주세요.",
      retryMissing:
        "복구할 리서치를 찾지 못했습니다. 리서치 목록에서 다시 열어 주세요.",
      retryFailed: "복구 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      newUpdates: (count) => `새 기록 ${count}개`,
      groups: {
        collection: "근거 준비",
        individual: "개별 조사",
        team: "팀 합의",
        debate: "팀 간 반론",
        audit: "근거 감사",
        committee: "최종 위원회",
      },
      conversations: {
        team: "공동 정리",
        debate: "주장·반론",
        committee: "위원회 검토",
      },
    },
    ja: {
      ...en,
      minutes: "議事録",
      meetingLog: "議事録",
      chat: "チャット",
      rightPanelView: "右パネル表示",
      rightPanel: "右パネル",
      collapsePanel: "右パネルを閉じる",
      expandPanel: "右パネルを開く",
      chatAfterComplete: "リサーチ完了後に利用できます",
      cancelling: "キャンセル中",
      cancelResearch: "分析をキャンセル",
      cancelFailed:
        "キャンセルを処理できませんでした。しばらくしてから再試行してください。",
      researchSetup: "リサーチ準備",
      setupBody:
        "分析チームと根拠収集を接続しています。準備できた記録から表示されます。",
      chatHistory: "チャット履歴",
      originalBrief: "元の質問",
      followUp: "追加質問",
      researchChair: "リサーチ議長",
      cancelled: "分析はキャンセルされました",
      incomplete: "リサーチを完了できませんでした",
      terminalBody:
        "完了済みの段階は保存され、クレジットは消費されません。同じ根拠を使って失敗した段階から再開できます。",
      startingRecovery: "再開中",
      resume: "失敗した段階から再開",
      retryUnavailable:
        "再開できる段階がありません。新しいリサーチを開始してください。",
      retryForbidden:
        "このリサーチは再開中または完了済みです。更新して状態を確認してください。",
      retryMissing: "リサーチが見つかりません。リストから開き直してください。",
      retryFailed: "再開に失敗しました。しばらくしてから再試行してください。",
      newUpdates: (count) => `新しい記録 ${count}件`,
      groups: {
        collection: "根拠準備",
        individual: "個別調査",
        team: "チーム統合",
        debate: "チーム間討論",
        audit: "根拠監査",
        committee: "最終委員会",
      },
      conversations: {
        team: "共同整理",
        debate: "反論と再反論",
        committee: "委員会審査",
      },
    },
    "zh-TW": {
      ...en,
      minutes: "會議記錄",
      meetingLog: "會議記錄",
      chat: "聊天",
      rightPanelView: "右側面板",
      rightPanel: "右側面板",
      collapsePanel: "收合右側面板",
      expandPanel: "展開右側面板",
      chatAfterComplete: "研究完成後即可使用",
      cancelling: "取消中",
      cancelResearch: "取消分析",
      cancelFailed: "無法處理取消要求，請稍後再試。",
      researchSetup: "研究準備",
      setupBody: "正在連接分析團隊與證據收集，記錄準備完成後會立即顯示。",
      chatHistory: "聊天記錄",
      originalBrief: "原始問題",
      followUp: "後續問題",
      researchChair: "研究主席",
      cancelled: "分析已取消",
      incomplete: "研究未能完成",
      terminalBody:
        "已完成的階段會保留且不扣除點數，可使用相同證據從失敗階段繼續。",
      startingRecovery: "正在恢復",
      resume: "從失敗階段繼續",
      retryUnavailable: "沒有可恢復的階段，請建立新研究。",
      retryForbidden: "研究已在恢復中或已完成，請重新整理。",
      retryMissing: "找不到研究，請從列表重新開啟。",
      retryFailed: "恢復失敗，請稍後再試。",
      newUpdates: (count) => `${count} 則新記錄`,
      groups: {
        collection: "證據準備",
        individual: "獨立研究",
        team: "團隊統整",
        debate: "跨團隊辯論",
        audit: "證據稽核",
        committee: "最終委員會",
      },
      conversations: {
        team: "共同統整",
        debate: "質疑與回應",
        committee: "委員會審查",
      },
    },
    es: {
      ...en,
      minutes: "Acta",
      meetingLog: "Registro",
      chat: "Chat",
      rightPanelView: "Vista del panel derecho",
      rightPanel: "Panel derecho",
      collapsePanel: "Cerrar panel derecho",
      expandPanel: "Abrir panel derecho",
      chatAfterComplete: "Disponible al finalizar la investigación",
      newUpdates: (count) => `${count} novedades`,
    },
    "pt-BR": {
      ...en,
      minutes: "Ata",
      meetingLog: "Registro",
      chat: "Chat",
      rightPanelView: "Painel direito",
      rightPanel: "Painel direito",
      collapsePanel: "Recolher painel direito",
      expandPanel: "Expandir painel direito",
      chatAfterComplete: "Disponível após a conclusão da pesquisa",
      newUpdates: (count) => `${count} atualizações`,
    },
    de: {
      ...en,
      minutes: "Protokoll",
      meetingLog: "Protokoll",
      chat: "Chat",
      rightPanelView: "Rechte Seitenleiste",
      rightPanel: "Rechte Seitenleiste",
      collapsePanel: "Seitenleiste schließen",
      expandPanel: "Seitenleiste öffnen",
      chatAfterComplete: "Nach Abschluss der Recherche verfügbar",
      newUpdates: (count) => `${count} neue Einträge`,
    },
    fr: {
      ...en,
      minutes: "Compte rendu",
      meetingLog: "Journal",
      chat: "Discussion",
      rightPanelView: "Panneau droit",
      rightPanel: "Panneau droit",
      collapsePanel: "Fermer le panneau droit",
      expandPanel: "Ouvrir le panneau droit",
      chatAfterComplete: "Disponible après la fin de la recherche",
      newUpdates: (count) => `${count} nouveautés`,
    },
  };
