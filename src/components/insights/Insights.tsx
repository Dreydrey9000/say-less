import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, type InsightsReport, type Topic } from "@/bindings";
import { Button } from "../ui/Button";
import { WorkingStatus } from "../ui/WorkingStatus";
import { TopicCard } from "./TopicCard";
import { DigestPanel } from "./DigestPanel";
import { HistorySearch } from "./HistorySearch";
import { NotesExportPanel } from "./NotesExportPanel";
import { ClaudePanel } from "./ClaudePanel";
import "./insights.css";

const WINDOWS: { days: number | null; key: string }[] = [
  { days: 7, key: "insights.window.week" },
  { days: 30, key: "insights.window.month" },
  { days: 90, key: "insights.window.quarter" },
  { days: null, key: "insights.window.all" },
];
// Fewer dictations than this rarely repeat anything meaningful.
const MIN_ENTRIES = 5;

function TopicList({
  titleKey,
  emptyKey,
  topics,
}: {
  titleKey: string;
  emptyKey: string;
  topics: Topic[];
}) {
  const { t } = useTranslation();
  return (
    <section className="insight-panel">
      <h2 className="insight-panel-title">{t(titleKey)}</h2>
      {topics.length === 0 ? (
        <p className="insight-fineprint">{t(emptyKey)}</p>
      ) : (
        <div className="insight-topic-list">
          {topics.map((topic) => (
            <TopicCard key={topic.id} topic={topic} />
          ))}
        </div>
      )}
    </section>
  );
}

export function Insights() {
  const { t } = useTranslation();
  const [days, setDays] = useState<number | null>(30);
  const [report, setReport] = useState<InsightsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (window: number | null) => {
    setLoading(true);
    setError(false);
    try {
      const result = await commands.getInsights(window);
      if (result.status === "ok") setReport(result.data);
      else setError(true);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const hasTopics =
    !!report &&
    report.problems.length + report.ideas.length + report.other.length > 0;
  const tooLittle = !!report && report.analyzed_entries < MIN_ENTRIES;

  return (
    <div className="max-w-3xl w-full mx-auto space-y-5 insights-page">
      <header>
        <p className="studio-eyebrow">{t("insights.tagline")}</p>
        <h1 className="text-3xl font-semibold">{t("insights.title")}</h1>
        <p className="text-sm text-text/75 mt-2">{t("insights.description")}</p>
        <p className="insight-privacy">{t("insights.privacy")}</p>
      </header>

      <div
        className="insight-windows"
        role="group"
        aria-label={t("insights.window.label")}
      >
        {WINDOWS.map((w) => (
          <button
            type="button"
            key={w.key}
            aria-pressed={days === w.days}
            onClick={() => setDays(w.days)}
          >
            {t(w.key)}
          </button>
        ))}
      </div>

      {loading && <WorkingStatus label={t("insights.loading")} />}
      {error && !loading && (
        <p role="alert" className="insight-error">
          {t("insights.error")}{" "}
          <Button variant="secondary" size="sm" onClick={() => void load(days)}>
            {t("insights.retry")}
          </Button>
        </p>
      )}

      {report && !error && (
        <>
          {tooLittle || !hasTopics ? (
            <section className="insight-empty" role="status">
              <strong>
                {tooLittle
                  ? t("insights.empty.fewTitle")
                  : t("insights.empty.noneTitle")}
              </strong>
              <p>
                {tooLittle
                  ? t("insights.empty.fewBody", {
                      count: report.analyzed_entries,
                      min: MIN_ENTRIES,
                    })
                  : t("insights.empty.noneBody")}
              </p>
            </section>
          ) : (
            <>
              <p className="insight-fineprint">
                {t("insights.analyzed", { count: report.analyzed_entries })}
              </p>
              {report.fix_first && (
                <section
                  className="insight-fix-first"
                  aria-labelledby="insight-fix-title"
                >
                  <h2 id="insight-fix-title" className="insight-panel-title">
                    {t("insights.fixFirst")}
                  </h2>
                  <TopicCard topic={report.fix_first} highlight />
                </section>
              )}
              <TopicList
                titleKey="insights.problems"
                emptyKey={
                  report.fix_first
                    ? "insights.noOtherProblems"
                    : "insights.noProblems"
                }
                topics={report.problems.filter(
                  (p) => p.id !== report.fix_first?.id,
                )}
              />
              <TopicList
                titleKey="insights.ideas"
                emptyKey="insights.noIdeas"
                topics={report.ideas}
              />
              {report.other.length > 0 && (
                <TopicList
                  titleKey="insights.other"
                  emptyKey="insights.noIdeas"
                  topics={report.other}
                />
              )}
              <DigestPanel report={report} days={days} />
            </>
          )}
        </>
      )}

      <HistorySearch />
      <NotesExportPanel />
      <ClaudePanel />
    </div>
  );
}
