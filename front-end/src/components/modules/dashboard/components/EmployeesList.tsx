import { Card } from "@/components/ui/Card";
import { Employee } from "@/types";

export default function EmployeesList({
  employees,
}: {
  employees: Employee[];
}) {
  return (
    <Card title="Employees" className="p-4">
      <div className="flex items-center justify-end">
        <p className="text-sm text-gray-500">
          Total{" "}
          <span className="ml-1 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
            {employees.length}
          </span>
        </p>
      </div>

      {employees.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">No employees yet</p>
          <p className="mt-1 text-xs text-gray-500">
            Start enrollment to add employees.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100 bg-white">
          {employees.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {e.name}
                </p>
                <p className="mt-0.5 truncate text-xs text-gray-500">
                  Employee ID:{" "}
                  <span className="font-medium">{e.empId ?? e.id}</span>
                </p>
              </div>

              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                Active
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
