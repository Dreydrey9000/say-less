import { useTranslation } from "react-i18next";
import { useNavigate } from "../navigation";
import type { SidebarSection } from "../Sidebar";
import { Button } from "./Button";

interface MovedNoteProps {
  text: string;
  section: SidebarSection;
  page: string;
}

/** A pointer to the one page that owns a setting, instead of a second copy of it. */
export function MovedNote({ text, section, page }: MovedNoteProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="moved-note">
      <span>{text}</span>
      <Button variant="secondary" size="sm" onClick={() => navigate(section)}>
        {t("controls.open", { page })}
      </Button>
    </div>
  );
}
