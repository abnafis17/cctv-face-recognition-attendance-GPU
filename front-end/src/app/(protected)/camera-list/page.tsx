import CameraListTable from "@/components/camera-list/CameraListTable";

export default function CameraListPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="page-header">
        <h1 className="page-title">Camera List</h1>
        <p className="page-subtitle">
          Manage camera metadata, stream settings, and cleanup inactive entries.
        </p>
      </div>

      <CameraListTable />
    </div>
  );
}
