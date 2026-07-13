import SettingsPanelPage from "@/components/modules/settings/SettingsPanelPage";

export default function SettingsUrlsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">
          Configure company-level runtime behavior and integration endpoints.
        </p>
      </div>

      <SettingsPanelPage />
    </div>
  );
}
