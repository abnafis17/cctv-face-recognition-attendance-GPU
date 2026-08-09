import UsersPanelPage from "@/components/modules/settings/users/UsersPanelPage";

export default function SettingsUsersPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="page-header">
        <h1 className="page-title">User Accounts</h1>
        <p className="page-subtitle">
          Manage system user accounts, roles, and administrative access.
        </p>
      </div>

      <UsersPanelPage />
    </div>
  );
}
