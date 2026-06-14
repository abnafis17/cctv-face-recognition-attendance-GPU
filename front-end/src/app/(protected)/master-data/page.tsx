import MasterDataPanelPage from "@/components/modules/master-data/MasterDataPanelPage";


export default function MasterDataPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="page-header">
        <h1 className="page-title">Master Data</h1>
        <p className="page-subtitle">
          Configure company-level master data records like visitor types and purposes of visit.
        </p>
      </div>

      <MasterDataPanelPage />
    </div>
  );
}
