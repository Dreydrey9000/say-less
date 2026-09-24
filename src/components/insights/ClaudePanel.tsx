import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, type McpSetup } from "@/bindings";
import { Button } from "../ui/Button";

function CopyBlock({ label, text }: { label: string; text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="insight-copy">
      <div className="insight-copy-head">
        <span>{label}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void copy()}
          aria-label={t("insights.claude.copyName", { what: label })}
        >
          {copied ? t("insights.claude.copied") : t("insights.claude.copy")}
        </Button>
      </div>
      <pre tabIndex={0}>{text}</pre>
    </div>
  );
}

export function ClaudePanel() {
  const { t } = useTranslation();
  const [setup, setSetup] = useState<McpSetup | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    commands
      .getMcpSetup()
      .then((r) => (r.status === "ok" ? setSetup(r.data) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);
  return (
    <section className="insight-panel" aria-labelledby="insight-claude-title">
      <h2 id="insight-claude-title" className="insight-panel-title">
        {t("insights.claude.title")}
      </h2>
      <p className="insight-fineprint">{t("insights.claude.description")}</p>
      {failed && (
        <p role="alert" className="insight-error">
          {t("insights.claude.error")}
        </p>
      )}
      {setup && (
        <>
          <CopyBlock
            label={t("insights.claude.command")}
            text={setup.claude_command}
          />
          <CopyBlock
            label={t("insights.claude.config")}
            text={setup.config_json}
          />
          <p className="insight-fineprint">{t("insights.claude.tools")}</p>
        </>
      )}
    </section>
  );
}
