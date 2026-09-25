import React from "react";
import { useTranslation } from "react-i18next";
import {
  Cog,
  FlaskConical,
  History,
  Info,
  Sparkles,
  Cpu,
  AudioLines,
  BookOpen,
  Palette,
  WandSparkles,
  Download,
  House,
  Lightbulb,
} from "lucide-react";
import { Home } from "./Home";
import { Insights } from "./insights/Insights";
import { StudioSettings } from "./settings/StudioSettings";
import { VoiceActions } from "./settings/VoiceActions";
import { WisprImport } from "./settings/WisprImport";
import SayLessLogo from "./icons/SayLessLogo";
import { WritingSettings } from "./settings/WritingSettings";
import { useSettings } from "../hooks/useSettings";
import {
  GeneralSettings,
  AdvancedSettings,
  HistorySettings,
  DebugSettings,
  AboutSettings,
  PostProcessingSettings,
  ModelsSettings,
} from "./settings";

export type SidebarSection = keyof typeof SECTIONS_CONFIG;

interface IconProps {
  width?: number | string;
  height?: number | string;
  size?: number | string;
  className?: string;
  [key: string]: any;
}

interface SectionConfig {
  labelKey: string;
  icon: React.ComponentType<IconProps>;
  component: React.ComponentType;
  enabled: (settings: any) => boolean;
}

export const SECTIONS_CONFIG = {
  home: {
    labelKey: "home.title",
    icon: House,
    component: Home,
    enabled: () => true,
  },
  general: {
    labelKey: "sidebar.general",
    icon: AudioLines,
    component: GeneralSettings,
    enabled: () => true,
  },
  history: {
    labelKey: "sidebar.history",
    icon: History,
    component: HistorySettings,
    enabled: () => true,
  },
  insights: {
    labelKey: "insights.title",
    icon: Lightbulb,
    component: Insights,
    enabled: () => true,
  },
  writing: {
    labelKey: "writing.title",
    icon: BookOpen,
    component: WritingSettings,
    enabled: () => true,
  },
  studio: {
    labelKey: "studio.title",
    icon: Palette,
    component: StudioSettings,
    enabled: () => true,
  },
  actions: {
    labelKey: "actions.title",
    icon: WandSparkles,
    component: VoiceActions,
    enabled: () => true,
  },
  import: {
    labelKey: "import.title",
    icon: Download,
    component: WisprImport,
    enabled: () => true,
  },
  models: {
    labelKey: "sidebar.models",
    icon: Cpu,
    component: ModelsSettings,
    enabled: () => true,
  },
  advanced: {
    labelKey: "sidebar.advanced",
    icon: Cog,
    component: AdvancedSettings,
    enabled: () => true,
  },
  postprocessing: {
    labelKey: "sidebar.postProcessing",
    icon: Sparkles,
    component: PostProcessingSettings,
    enabled: (settings) => settings?.post_process_enabled ?? false,
  },
  debug: {
    labelKey: "sidebar.debug",
    icon: FlaskConical,
    component: DebugSettings,
    enabled: (settings) => settings?.debug_mode ?? false,
  },
  about: {
    labelKey: "sidebar.about",
    icon: Info,
    component: AboutSettings,
    enabled: () => true,
  },
} as const satisfies Record<string, SectionConfig>;

interface SidebarProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSectionChange,
}) => {
  const { t } = useTranslation();
  const { settings } = useSettings();

  const availableSections = Object.entries(SECTIONS_CONFIG)
    .filter(([_, config]) => config.enabled(settings))
    .map(([id, config]) => ({ id: id as SidebarSection, ...config }));

  return (
    <nav
      aria-label={t("controls.navigation")}
      className="app-sidebar flex flex-col w-40 shrink-0 h-full border-e border-mid-gray/20 items-center px-2"
    >
      <SayLessLogo width={120} className="m-4" />
      <div className="app-sidebar-nav flex flex-col w-full items-center gap-1 pt-2 border-t border-mid-gray/20">
        {availableSections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;

          return (
            <button
              type="button"
              aria-current={isActive ? "page" : undefined}
              key={section.id}
              className={`flex gap-2 items-center p-2 w-full rounded-lg cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text ${
                isActive
                  ? "bg-mid-gray/20"
                  : "hover:bg-mid-gray/20 hover:opacity-100 opacity-85"
              }`}
              onClick={() => onSectionChange(section.id)}
            >
              <Icon width={24} height={24} className="shrink-0" />
              <p
                className="text-sm font-medium truncate"
                title={t(section.labelKey)}
              >
                {t(section.labelKey)}
              </p>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
