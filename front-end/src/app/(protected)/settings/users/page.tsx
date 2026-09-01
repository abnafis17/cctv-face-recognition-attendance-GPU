import UsersPanelPage from "@/components/modules/settings/users/UsersPanelPage";

export default function SettingsUsersPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="page-header">
        <h1 className="page-title">Users</h1>
        <p className="page-subtitle">
          Manage company user access, roles, and permissions.
        </p>
      </div>

      <UsersPanelPage />
    </div>
  );
}
