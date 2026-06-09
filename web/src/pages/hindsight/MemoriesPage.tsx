import { Brain, FileText, Lightbulb } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hindsightApi } from "@/src/api/hindsight";
import { NS } from "@/src/i18n";
import { DocumentsView } from "./components/DocumentsView";
import { MemoriesView } from "./components/MemoriesView";
import { MentalModelsView } from "./components/MentalModelsView";

export function MemoriesPage() {
  const { t } = useTranslation(NS.HINDSIGHT);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    hindsightApi
      .getStatus()
      .then((res) => {
        setEnabled(res.data.enabled);
      })
      .catch((err) => {
        console.error("Failed to get Hindsight status:", err);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">{t("status.loading")}</p>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">{t("status.notConfigured")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Brain className="w-5 h-5" />
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("description")}</p>
      </div>

      <Tabs defaultValue="memories" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 border-b">
          <TabsList>
            <TabsTrigger value="memories">
              <Brain className="w-4 h-4 mr-1.5" />
              {t("tabs.memories")}
            </TabsTrigger>
            <TabsTrigger value="documents">
              <FileText className="w-4 h-4 mr-1.5" />
              {t("tabs.documents")}
            </TabsTrigger>
            <TabsTrigger value="mental-models">
              <Lightbulb className="w-4 h-4 mr-1.5" />
              {t("tabs.mentalModels")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="memories" className="flex-1 overflow-auto">
          <MemoriesView />
        </TabsContent>
        <TabsContent value="documents" className="flex-1 overflow-auto">
          <DocumentsView />
        </TabsContent>
        <TabsContent value="mental-models" className="flex-1 overflow-auto">
          <MentalModelsView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
