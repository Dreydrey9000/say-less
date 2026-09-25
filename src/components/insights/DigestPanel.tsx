import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  commands,
  type AiSummaryStatus,
  type InsightsReport,
} from "@/bindings";
import { Button } from "../ui/Button";
import { WorkingStatus } from "../ui/WorkingStatus";

const canSpeak = () =>
  typeof window !== "undefined" && "speechSynthesis" in window;

export function DigestPanel({
  report,
  days,
}: {
  report: InsightsReport;
  days: number | null;
}) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<AiSummaryStatus | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    commands
      .getAiSummaryStatus()
      .then(setStatus)
      .catch(() => setStatus({ available: false, provider_label: null }));
  }, []);

  // A digest belongs to one window; drop it when the window changes.
  useEffect(() => {
    setSummary(null);
    setError(null);
  }, [days]);

  useEffect(
    () => () => {
      if (canSpeak()) window.speechSynthesis.cancel();
    },
    [],
  );

  const localDigest = () => {
    const parts: string[] = [];
    if (report.fix_first)
      parts.push(
        t("insights.digest.fixFirst", {
          label: report.fix_first.label,
          count: report.fix_first.count,
        }),
      );
    const others = report.problems.slice(1, 4).map((p) => p.label);
    if (others.length)
      parts.push(t("insights.digest.problems", { list: others.join(", ") }));
    const ideas = report.ideas.slice(0, 3).map((p) => p.label);
    if (ideas.length)
      parts.push(t("insights.digest.ideas", { list: ideas.join(", ") }));
    return parts.length ? parts.join(" ") : t("insights.digest.none");
  };

  const summarize = async () => {
    setBusy(true);
    setError(null);
    const result = await commands.summarizeInsights(days);
    setBusy(false);
    if (result.status === "ok") setSummary(result.data);
    else setError(result.error);
  };

  const readAloud = () => {
    if (!canSpeak()) return;
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(summary ?? localDigest());
    utterance.lang = i18n.language;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(utterance);
    setSpeaking(true);
  };

  const available = status?.available ?? false;
  return (
    <section className="insight-panel" aria-labelledby="insight-digest-title">
      <h2 id="insight-digest-title" className="insight-panel-title">
        {t("insights.digest.title")}
      </h2>
      <p className="insight-digest-text" aria-live="polite">
        {summary ?? localDigest()}
      </p>
      {busy && <WorkingStatus label={t("insights.digest.summarizing")} />}
      {error && (
        <p role="alert" className="insight-error">
          {error === "no_provider"
            ? t("insights.digest.noProvider")
            : t("insights.digest.failed")}
        </p>
      )}
      <div className="insight-actions">
        <Button
          variant="secondary"
          size="sm"
          disabled={!available || busy}
          onClick={() => void summarize()}
        >
          {t("insights.digest.summarize")}
        </Button>
        {canSpeak() && (
          <Button variant="secondary" size="sm" onClick={readAloud}>
            {speaking ? t("insights.digest.stop") : t("insights.digest.read")}
          </Button>
        )}
      </div>
      <p className="insight-fineprint">
        {available
          ? t("insights.digest.sendsOnly", {
              provider: status?.provider_label ?? "",
            })
          : t("insights.digest.setupProvider")}
      </p>
    </section>
  );
}
