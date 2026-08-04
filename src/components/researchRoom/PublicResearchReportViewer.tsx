"use client";

import {
  ArrowLeft,
  ArrowUp,
  LockKeyhole,
  MessageSquareText,
  PanelLeftClose,
  RotateCcw,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import type { Locale } from "../../lib/i18n";
import type { ResearchFileData } from "../../research/compositions/types";
import { agents } from "../../research/mockResearch";
import type { ResearchRoomConversation } from "../../research/server/researchRoom/researchRoomCatalog";
import type { ResearchCompany } from "../../research/types";
import { CompletedResearchFile } from "../research/CompletedResearchFile";

type PrivateMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
};

type Props = {
  readonly company: ResearchCompany;
  readonly conversation: readonly ResearchRoomConversation[];
  readonly file: ResearchFileData;
  readonly locale: Locale;
  readonly originalQuestion: string;
  readonly reportId: string;
  readonly version: number;
};

function conversationAgent(agentId: string) {
  return (
    agents.find((agent) => agent.id === agentId) ??
    agents.find((agent) => agent.id === "chair") ??
    agents[0]
  );
}

export function PublicResearchReportViewer({
  company,
  conversation,
  file,
  locale,
  originalQuestion,
  reportId,
  version,
}: Props) {
  const [panelOpen, setPanelOpen] = useState(true);
  const [privateMode, setPrivateMode] = useState(false);
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [messages, setMessages] = useState<readonly PrivateMessage[]>([]);
  const initialQuestion = useMemo(
    () =>
      originalQuestion.trim() || file.researchDirection?.trim() || undefined,
    [file.researchDirection, originalQuestion],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (trimmed.length < 2 || submitting) return;
    const userMessage: PrivateMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
    };
    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setSubmitting(true);
    try {
      const response = await fetch(`/api/research-room/${reportId}/chat`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed, locale }),
      });
      if (!response.ok) throw new Error("PRIVATE_CHAT_UNAVAILABLE");
      const body = (await response.json()) as { answer?: string };
      if (!body.answer) throw new Error("PRIVATE_CHAT_EMPTY");
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: body.answer ?? "" },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            locale === "ko"
              ? "이 발행본에서 답을 찾지 못했습니다. 질문을 더 구체적으로 적어 주세요."
              : "This edition does not contain enough context for that question. Try a more specific prompt.",
        },
      ]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="public-research-viewer"
      data-panel-open={panelOpen ? "true" : "false"}
    >
      <aside
        className="public-research-viewer__rail"
        aria-label={
          locale === "ko" ? "리서치룸 내비게이션" : "Research room navigation"
        }
      >
        <Link
          href={`/research-room?lang=${locale}`}
          aria-label={
            locale === "ko" ? "리서치룸으로 돌아가기" : "Back to research room"
          }
        >
          <ArrowLeft size={20} />
        </Link>
        <span aria-hidden="true">S</span>
        <button
          type="button"
          onClick={() => setPanelOpen((open) => !open)}
          aria-label={
            locale === "ko" ? "대화 패널 전환" : "Toggle conversation panel"
          }
        >
          <PanelLeftClose size={19} />
        </button>
      </aside>

      <main className="public-research-viewer__report">
        <div className="public-research-viewer__notice">
          <span>
            {locale === "ko"
              ? "리서치룸 공개 발행본"
              : "Public Research Room edition"}
          </span>
          <p>
            {locale === "ko"
              ? "원 작성자의 실행 기록과 개인 정보는 포함되지 않습니다."
              : "The author’s run history and private identity are not included."}
          </p>
        </div>
        <CompletedResearchFile
          company={company}
          locale={locale}
          report={file}
          version={version}
          onReplay={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        />
      </main>

      <aside
        className="public-research-viewer__conversation"
        aria-label={locale === "ko" ? "리서치 대화" : "Research conversation"}
      >
        <header>
          <div>
            <span>
              {privateMode
                ? locale === "ko"
                  ? "나만의 대화"
                  : "Private session"
                : locale === "ko"
                  ? "원 리서치 대화"
                  : "Original conversation"}
            </span>
            <small>
              <LockKeyhole size={12} />
              {privateMode
                ? locale === "ko"
                  ? "저장되지 않음"
                  : "Not saved"
                : locale === "ko"
                  ? "읽기 전용"
                  : "Read only"}
            </small>
          </div>
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            aria-label={locale === "ko" ? "패널 닫기" : "Close panel"}
          >
            <X size={18} />
          </button>
        </header>

        <div className="public-research-viewer__messages">
          {privateMode ? (
            messages.length === 0 ? (
              <div className="public-research-viewer__private-empty">
                <MessageSquareText size={24} />
                <strong>
                  {locale === "ko"
                    ? "이 리포트에 이어서 물어보세요."
                    : "Ask a follow-up on this report."}
                </strong>
                <p>
                  {locale === "ko"
                    ? "대화는 현재 탭에만 존재하며 다른 사용자에게 공개되거나 저장되지 않습니다."
                    : "This session lives only in the current tab. It is not stored or shown to anyone else."}
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <article key={message.id} data-role={message.role}>
                  <span>
                    {message.role === "user"
                      ? locale === "ko"
                        ? "나"
                        : "You"
                      : locale === "ko"
                        ? "리서치 의장"
                        : "Research chair"}
                  </span>
                  <p>{message.text}</p>
                </article>
              ))
            )
          ) : (
            <>
              {initialQuestion === undefined ? null : (
                <article data-role="user">
                  <span>{locale === "ko" ? "원 질문" : "Original brief"}</span>
                  <p>{initialQuestion}</p>
                </article>
              )}
              {conversation.map((exchange) => {
                const agent = conversationAgent(exchange.agentId);
                return (
                  <div
                    className="public-research-viewer__exchange"
                    key={`${exchange.createdAt}-${exchange.question}`}
                  >
                    <article data-role="user">
                      <span>{locale === "ko" ? "후속 질문" : "Follow-up"}</span>
                      <p>{exchange.question}</p>
                    </article>
                    <article data-role="assistant">
                      {agent === undefined ? null : (
                        <Image
                          src={agent.image}
                          alt=""
                          width={22}
                          height={48}
                        />
                      )}
                      <span>
                        {agent?.name[locale] ??
                          (locale === "ko" ? "리서치 의장" : "Research chair")}
                      </span>
                      <p>{exchange.answer}</p>
                    </article>
                  </div>
                );
              })}
              {conversation.length === 0 ? (
                <div className="public-research-viewer__private-empty">
                  <MessageSquareText size={24} />
                  <strong>
                    {locale === "ko"
                      ? "공개된 후속 대화가 없습니다."
                      : "No public follow-up yet."}
                  </strong>
                  <p>
                    {locale === "ko"
                      ? "아래 버튼으로 이 리포트에 나만의 질문을 이어갈 수 있습니다."
                      : "Start a private follow-up below."}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>

        {privateMode ? (
          <form onSubmit={(event) => void submit(event)}>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={600}
              placeholder={
                locale === "ko" ? "이 리포트에 질문..." : "Ask this report..."
              }
              aria-label={locale === "ko" ? "개인 질문" : "Private question"}
            />
            <div>
              <button
                type="button"
                onClick={() => {
                  setPrivateMode(false);
                  setMessages([]);
                }}
              >
                <RotateCcw size={15} />
                {locale === "ko" ? "원 대화" : "Original"}
              </button>
              <button
                type="submit"
                disabled={submitting || question.trim().length < 2}
              >
                {submitting
                  ? locale === "ko"
                    ? "답변 찾는 중"
                    : "Finding answer"
                  : locale === "ko"
                    ? "보내기"
                    : "Send"}
                <ArrowUp size={15} />
              </button>
            </div>
          </form>
        ) : (
          <footer>
            <button type="button" onClick={() => setPrivateMode(true)}>
              <MessageSquareText size={17} />
              {locale === "ko"
                ? "새롭게 대화 시작하기"
                : "Start a new private conversation"}
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}
