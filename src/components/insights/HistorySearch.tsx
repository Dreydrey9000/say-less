import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, type TranscriptHit } from "@/bindings";
import { formatDateTime } from "@/utils/dateFormat";
import { Input } from "../ui/Input";

export function HistorySearch() {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<TranscriptHit[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits(null);
      setError(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const result = await commands.searchHistoryText(q, null);
      if (cancelled) return;
      if (result.status === "ok") {
        setHits(result.data);
        setError(false);
      } else setError(true);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <section className="insight-panel" aria-labelledby="insight-search-title">
      <h2 id="insight-search-title" className="insight-panel-title">
        {t("insights.search.title")}
      </h2>
      <Input
        type="search"
        value={query}
        maxLength={200}
        placeholder={t("insights.search.placeholder")}
        aria-label={t("insights.search.label")}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full"
      />
      <p className="sr-only" aria-live="polite">
        {hits ? t("insights.search.count", { count: hits.length }) : ""}
      </p>
      {error && (
        <p role="alert" className="insight-error">
          {t("insights.search.error")}
        </p>
      )}
      {hits && hits.length === 0 && (
        <p className="insight-fineprint">{t("insights.search.none")}</p>
      )}
      {hits && hits.length > 0 && (
        <ul className="insight-quotes insight-search-results">
          {hits.map((hit) => (
            <li key={hit.id}>
              <time dateTime={new Date(hit.timestamp * 1000).toISOString()}>
                {formatDateTime(String(hit.timestamp), i18n.language)}
              </time>
              <p>{hit.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
