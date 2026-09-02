import { Card } from "@/components/ui/Card";
import { AttendanceRow } from "@/types";

function formatTime(ts: string | number | Date) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "N/A";
  }
}

export default function AttendanceList({
  attendance,
}: {
  attendance: AttendanceRow[];
}) {
  return (
    <Card title="Recent Attendance" className="p-4">
      <div className="flex items-center justify-end">
        <p className="text-sm text-gray-500">
          Showing latest{" "}
          <span className="ml-1 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
            {attendance.length}
          </span>
        </p>
      </div>

      {attendance.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">
            No attendance records
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Records will appear after recognition events.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {attendance.map((a) => {
            const conf = typeof a.confidence === "number" ? a.confidence : null;

            return (
              <div
                key={a.id}
                className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {a.name}{" "}
                      <span className="ml-1 text-xs font-normal text-gray-500">
                        ({a.employeeId})
                      </span>
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700">
                        Camera: {a.cameraName ?? "N/A"}
                      </span>

                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700">
                        Confidence: {conf !== null ? conf.toFixed(3) : "N/A"}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-xs text-gray-500 sm:text-right">
                    <div className="rounded-full bg-gray-50 px-3 py-1">
                      {formatTime(a.timestamp)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
