import { getTranslations } from "next-intl/server";
import { Shell } from "@/components/Shell";
import { StockWorkspace } from "@/components/StockWorkspace";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("app");
  return (
    <Shell locale={locale}>
      <StockWorkspace
        appName={t("name")}
        stockOutLabel={t("stockOut")}
        stockInLabel={t("stockIn")}
        searchPlaceholder={t("search")}
      />
    </Shell>
  );
}
