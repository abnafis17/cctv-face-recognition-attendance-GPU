"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { API } from "@/config/axiosInstance";
import MasterDataTabSection from "./MasterDataTabSection";
import { Shield } from "lucide-react";

export default function UserMasterDataTab() {
  return (
    <Tabs defaultValue="user-role" className="w-full">
      <TabsList className="w-full h-auto flex flex-wrap gap-1 p-1 bg-zinc-100/50 border border-zinc-200/30 rounded-xl shadow-xs">
        <TabsTrigger
          value="user-role"
          className="flex-1 min-w-[140px] sm:min-w-[180px] h-8 text-xs sm:text-sm font-medium transition-all duration-200 rounded-lg hover:bg-zinc-50/50 hover:text-zinc-900 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-xs gap-2"
        >
          <Shield className="h-3.5 w-3.5 shrink-0" />
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
