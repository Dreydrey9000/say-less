import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Topic } from "@/bindings";
import { formatDate } from "@/utils/dateFormat";

export function TopicCard({
  topic,
  highlight = false,
}: {
  topic: Topic;
  highlight?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const date = (ts: number) => formatDate(String(ts), i18n.language);
  return (
    <details className={`insight-topic${highlight ? " is-highlight" : ""}`}>
      <summary>
        <span className="insight-topic-label">{topic.label}</span>
        <span className="insight-topic-count">
          {t("insights.mentions", { count: topic.count })}
        </span>
        <ChevronDown aria-hidden="true" className="insight-chevron" size={16} />
      </summary>
      <div className="insight-topic-body">
        <p className="insight-topic-meta">
          {t("insights.firstLast", {
            first: date(topic.first_seen),
            last: date(topic.last_seen),
          })}
        </p>
        {topic.keywords.length > 0 && (
          <p className="insight-topic-meta">
            {t("insights.related", { words: topic.keywords.join(", ") })}
          </p>
        )}
        <ul className="insight-quotes" aria-label={t("insights.quotes")}>
          {topic.examples.map((q) => (
            <li key={q.entry_id}>
              <time dateTime={new Date(q.timestamp * 1000).toISOString()}>
                {date(q.timestamp)}
              </time>
              <blockquote>{q.text}</blockquote>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
