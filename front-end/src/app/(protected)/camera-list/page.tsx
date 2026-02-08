import CameraListTable from "@/components/camera-list/CameraListTable";

export default function CameraListPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Camera List</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage camera metadata, stream settings, and cleanup inactive entries.
        </p>
      </div>

      <CameraListTable />
    </div>
  );
}
