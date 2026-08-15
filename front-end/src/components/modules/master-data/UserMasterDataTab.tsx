"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { API } from "@/config/axiosInstance";
import MasterDataTabSection from "./MasterDataTabSection";

export default function UserMasterDataTab() {
  return (
    <Tabs defaultValue="user-role" className="w-full">
      <TabsList className="bg-zinc-100/80 p-1">
        <TabsTrigger value="user-role" className="text-xs sm:text-sm">
          User Role
        </TabsTrigger>
      </TabsList>

      <TabsContent value="user-role" className="mt-4 space-y-4">
        <MasterDataTabSection
          apiPath={API.MASTER_DATA_USER_ROLES}
          label="User Role"
          placeholderName="admin, general user, operator, manager..."
        />
      </TabsContent>
    </Tabs>
  );
}
