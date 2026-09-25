import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import type { ModelInfo } from "@/bindings";
import type { ModelCardStatus } from "./ModelCard";
import ModelCard, { isLegacySource } from "./ModelCard";
import SayLessLogo from "../icons/SayLessLogo";
import { useModelStore } from "../../stores/modelStore";

interface OnboardingProps {
  onModelSelected: () => void;
  preview?: boolean;
}

const Onboarding: React.FC<OnboardingProps> = ({
  onModelSelected,
  preview = false,
}) => {
  const { t } = useTranslation();
  const {
    models,
    downloadModel,
    selectModel,
    downloadingModels,
    verifyingModels,
    extractingModels,
    downloadProgress,
    downloadStats,
    cancelDownload,
  } = useModelStore();
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const hasStartedSelection = useRef(false);

  const isBusy = selectedModelId !== null;

  // Curate the download list: legacy (.bin/ONNX) downloads are deprecated and
  // never shown here (they still appear in the compatible section if already on
  // disk). The catalog arrives in editorial rank order, so the first
  // recommended model is "Our pick". Everything else waits behind "See other
  // engines", so a first-timer makes one choice instead of reading ~16 names.
  const { downloadable, topPick, others } = useMemo(() => {
    const downloadable = models.filter(
      (m: ModelInfo) => !m.is_downloaded && !isLegacySource(m),
    );
    const recommended = downloadable.filter((m: ModelInfo) => m.is_recommended);
    const topPick = recommended[0] ?? null;
    // Remaining recommended picks first, then the ranked tail.
    const others = [
      ...recommended.slice(1),
      ...downloadable.filter((m: ModelInfo) => !m.is_recommended),
    ];
    return { downloadable, topPick, others };
  }, [models]);

  // With no pick left to download (e.g. all already on disk), list everything.
  const showOthers = showAll || !topPick;

  // Watch for the selected model to finish downloading + verifying + extracting
  useEffect(() => {
    // Debug previews are inert: never switch the user's active model. Guarded
    // here as well as in the handlers because this is where the backend call
    // actually happens.
    if (preview) return;

    if (!selectedModelId) {
      hasStartedSelection.current = false;
      return;
    }

    const model = models.find((m) => m.id === selectedModelId);
    const stillDownloading = selectedModelId in downloadingModels;
    const stillVerifying = selectedModelId in verifyingModels;
    const stillExtracting = selectedModelId in extractingModels;

    if (
      model?.is_downloaded &&
      !stillDownloading &&
      !stillVerifying &&
      !stillExtracting &&
      !hasStartedSelection.current
    ) {
      hasStartedSelection.current = true;

      // Model is ready — select it and transition
      selectModel(selectedModelId).then((success) => {
        if (success) {
          onModelSelected();
        } else {
          toast.error(t("onboarding.errors.selectModel"));
          hasStartedSelection.current = false;
          setSelectedModelId(null);
        }
      });
    }
  }, [
    selectedModelId,
    models,
    downloadingModels,
    verifyingModels,
    extractingModels,
    selectModel,
    onModelSelected,
    preview,
    t,
  ]);

  const handleDownloadModel = async (modelId: string) => {
    if (preview) return;

    setSelectedModelId(modelId);

    // Error toast is handled centrally by the model-download-failed event listener
    // in modelStore — no toast here to avoid duplicates.
    const success = await downloadModel(modelId);
    if (!success) {
      setSelectedModelId(null);
    }
  };

  const handleCancelDownload = async (modelId: string) => {
    if (preview) return;

    const success = await cancelDownload(modelId);
    if (success) {
      setSelectedModelId(null);
    }
  };

  const handleSelectExistingModel = (modelId: string) => {
    if (preview) return;

    setSelectedModelId(modelId);
  };

  const getModelStatus = (modelId: string): ModelCardStatus => {
    if (modelId in extractingModels) return "extracting";
    if (modelId in verifyingModels) return "verifying";
    if (modelId in downloadingModels) return "downloading";
    return "downloadable";
  };

  const getExistingModelStatus = (modelId: string): ModelCardStatus => {
    if (selectedModelId === modelId) return "switching";
    return "available";
  };

  const getModelDownloadProgress = (modelId: string): number | undefined => {
    return downloadProgress[modelId]?.percentage;
  };

  const getModelDownloadSpeed = (modelId: string): number | undefined => {
    return downloadStats[modelId]?.speed;
  };

  return (
    <div className="h-screen w-full flex flex-col p-6 gap-4">
      <div className="flex flex-col items-center gap-2 shrink-0">
        <SayLessLogo width={200} />
        <p className="text-text-muted max-w-md font-medium mx-auto text-center">
          {t("onboarding.subtitle")}
        </p>
      </div>

      <div className="max-w-[600px] w-full mx-auto text-center flex-1 flex flex-col min-h-0">
        <div className="space-y-6 pb-6">
          {models.some((m: ModelInfo) => m.is_downloaded) && (
            <div className="space-y-3">
              <div className="text-left">
                <h2 className="text-sm font-medium text-text-muted">
                  {t("onboarding.existingModelsTitle")}
                </h2>
              </div>
              {models
                .filter((m: ModelInfo) => m.is_downloaded)
                .map((model: ModelInfo) => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    status={getExistingModelStatus(model.id)}
                    disabled={isBusy}
                    onSelect={handleSelectExistingModel}
                    showRecommended={false}
                  />
                ))}
            </div>
          )}

          {downloadable.length > 0 && (
            <div className="space-y-3">
              {topPick && (
                <>
                  <div className="text-left">
                    <h2 className="text-sm font-medium text-text-muted">
                      {t("onboarding.downloadModelsTitle")}
                    </h2>
                  </div>
                  <ModelCard
                    model={topPick}
                    variant="featured"
                    status={getModelStatus(topPick.id)}
                    disabled={isBusy}
                    onSelect={handleDownloadModel}
                    onDownload={handleDownloadModel}
                    onCancel={handleCancelDownload}
                    downloadProgress={getModelDownloadProgress(topPick.id)}
                    downloadSpeed={getModelDownloadSpeed(topPick.id)}
                    showRecommended={false}
                  />
                </>
              )}

              {topPick && others.length > 0 && (
                <button
                  type="button"
                  aria-expanded={showAll}
                  onClick={() => setShowAll((v) => !v)}
                  className="flex items-center justify-center gap-1.5 mx-auto min-h-8 py-1 text-sm font-medium text-text-muted hover:text-text transition-colors"
                >
                  {showAll
                    ? t("onboarding.hideOtherEngines")
                    : t("onboarding.otherEngines", { total: others.length })}
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${
                      showAll ? "rotate-180" : ""
                    }`}
                  />
                </button>
              )}

              {showOthers && others.length > 0 && (
                <>
                  <div className="text-left pt-2">
                    <h2 className="text-sm font-medium text-text-muted">
                      {t("onboarding.otherEnginesNote")}
                    </h2>
                  </div>
                  {others.map((model: ModelInfo) => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      status={getModelStatus(model.id)}
                      disabled={isBusy}
                      onSelect={handleDownloadModel}
                      onDownload={handleDownloadModel}
                      onCancel={handleCancelDownload}
                      downloadProgress={getModelDownloadProgress(model.id)}
                      downloadSpeed={getModelDownloadSpeed(model.id)}
                      showRecommended={false}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
