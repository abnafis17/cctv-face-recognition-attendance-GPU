export type EmployeeHierarchySelection = {
  unit: string;
  department: string;
  section: string;
  line: string;
};

export type EmployeeHierarchyValues = {
  unit?: string | null;
  department?: string | null;
  section?: string | null;
  line?: string | null;
};

type NormalizedHierarchyRow<T extends EmployeeHierarchyValues> = {
  source: T;
  unit: string;
  department: string;
  section: string;
  line: string;
};

const HIERARCHY_EMPTY_MARKERS = new Set([
  "",
  "-",
  "--",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
]);

export function normalizeHierarchyValue(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const key = text.toLowerCase();
  return HIERARCHY_EMPTY_MARKERS.has(key) ? "" : text;
}

function uniqSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

function normalizeRows<T extends EmployeeHierarchyValues>(
  rows: T[],
): NormalizedHierarchyRow<T>[] {
  return rows.map((row) => ({
    source: row,
    unit: normalizeHierarchyValue(row.unit),
    department: normalizeHierarchyValue(row.department),
    section: normalizeHierarchyValue(row.section),
    line: normalizeHierarchyValue(row.line),
  }));
}

export function deriveEmployeeHierarchy<T extends EmployeeHierarchyValues>(
  rows: T[],
  selection: EmployeeHierarchySelection,
) {
  const normalizedRows = normalizeRows(rows);

  const units = uniqSorted(
    normalizedRows.map((row) => row.unit).filter(Boolean),
  );
  const hasUnit = units.length > 0;
  const selectedUnit = hasUnit
    ? normalizeHierarchyValue(selection.unit)
    : "";
  const effectiveUnit = units.includes(selectedUnit) ? selectedUnit : "";

  const byUnit = normalizedRows.filter(
    (row) => !effectiveUnit || row.unit === effectiveUnit,
  );

  const departments = uniqSorted(
    byUnit.map((row) => row.department).filter(Boolean),
  );
  const hasDepartment = departments.length > 0;
  const selectedDepartment = hasDepartment
    ? normalizeHierarchyValue(selection.department)
    : "";
  const effectiveDepartment = departments.includes(selectedDepartment)
    ? selectedDepartment
    : "";

  const byDepartment = byUnit.filter(
    (row) => !effectiveDepartment || row.department === effectiveDepartment,
  );

  const sections = uniqSorted(
    byDepartment.map((row) => row.section).filter(Boolean),
  );
  const hasSection = sections.length > 0;
  const selectedSection = hasSection
    ? normalizeHierarchyValue(selection.section)
    : "";
  const effectiveSection = sections.includes(selectedSection)
    ? selectedSection
    : "";

  const bySection = byDepartment.filter(
    (row) => !effectiveSection || row.section === effectiveSection,
  );

  const lines = uniqSorted(
    bySection.map((row) => row.line).filter(Boolean),
  );
  const hasLine = lines.length > 0;
  const selectedLine = hasLine ? normalizeHierarchyValue(selection.line) : "";
  const effectiveLine = lines.includes(selectedLine) ? selectedLine : "";

  const filteredRows = bySection
    .filter((row) => !effectiveLine || row.line === effectiveLine)
    .map((row) => row.source);

  return {
    options: {
      units,
      departments,
      sections,
      lines,
    },
    availability: {
      hasUnit,
      hasDepartment,
      hasSection,
      hasLine,
    },
    normalizedSelection: {
      unit: effectiveUnit,
      department: effectiveDepartment,
      section: effectiveSection,
      line: effectiveLine,
    },
    filteredRows,
  };
}

export function hasHierarchySelection(
  selection: EmployeeHierarchySelection,
  availability: {
    hasUnit: boolean;
    hasDepartment: boolean;
    hasSection: boolean;
    hasLine: boolean;
  },
): boolean {
  if (availability.hasLine && normalizeHierarchyValue(selection.line)) return true;
  if (availability.hasSection && normalizeHierarchyValue(selection.section)) {
    return true;
  }
  if (
    availability.hasDepartment &&
    normalizeHierarchyValue(selection.department)
  ) {
    return true;
  }
  if (availability.hasUnit && normalizeHierarchyValue(selection.unit)) return true;
  return !(availability.hasUnit || availability.hasDepartment || availability.hasSection || availability.hasLine);
}
