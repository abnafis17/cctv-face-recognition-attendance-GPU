"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import VisitorMasterDataTab from "./VisitorMasterDataTab";
import UserMasterDataTab from "./UserMasterDataTab";
import { Users, UserCog } from "lucide-react";

export default function MasterDataPanelPage() {
  return (
    <Tabs defaultValue="visitor" className="w-full">
      <TabsList className="w-full h-auto flex flex-wrap gap-1 p-1 bg-zinc-100/80 border border-zinc-200/50 rounded-xl shadow-xs">
        <TabsTrigger
          value="visitor"
          className="flex-1 min-w-[140px] sm:min-w-[180px] h-8 text-xs sm:text-sm font-medium transition-all duration-200 rounded-lg hover:bg-zinc-50/50 hover:text-zinc-900 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-xs gap-2"
        >
          <Users className="h-3.5 w-3.5 shrink-0" />
          Visitor Module
        </TabsTrigger>
        <TabsTrigger
          value="user"
          className="flex-1 min-w-[140px] sm:min-w-[180px] h-8 text-xs sm:text-sm font-medium transition-all duration-200 rounded-lg hover:bg-zinc-50/50 hover:text-zinc-900 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-xs gap-2"
        >
          <UserCog className="h-3.5 w-3.5 shrink-0" />
          User Module
        </TabsTrigger>
      </TabsList>

      <TabsContent value="visitor" className="mt-4 space-y-4">
        <VisitorMasterDataTab />
      </TabsContent>

      <TabsContent value="user" className="mt-4 space-y-4">
        <UserMasterDataTab />
      </TabsContent>
    </Tabs>
  );
}
