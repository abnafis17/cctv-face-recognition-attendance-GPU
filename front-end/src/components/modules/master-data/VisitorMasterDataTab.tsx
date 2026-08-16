"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { API } from "@/config/axiosInstance";
import MasterDataTabSection from "./MasterDataTabSection";
import { Tag, ClipboardList } from "lucide-react";

export default function VisitorMasterDataTab() {
  return (
    <Tabs defaultValue="visitor-type" className="w-full">
      <TabsList className="w-full h-auto flex flex-wrap gap-1 p-1 bg-zinc-100/50 border border-zinc-200/30 rounded-xl shadow-xs">
        <TabsTrigger
          value="visitor-type"
          className="flex-1 min-w-[140px] sm:min-w-[180px] h-8 text-xs sm:text-sm font-medium transition-all duration-200 rounded-lg hover:bg-zinc-50/50 hover:text-zinc-900 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-xs gap-2"
        >
          <Tag className="h-3.5 w-3.5 shrink-0" />
          Visitor Type
        </TabsTrigger>
        <TabsTrigger
          value="purpose-of-visit"
          className="flex-1 min-w-[140px] sm:min-w-[180px] h-8 text-xs sm:text-sm font-medium transition-all duration-200 rounded-lg hover:bg-zinc-50/50 hover:text-zinc-900 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-xs gap-2"
        >
          <ClipboardList className="h-3.5 w-3.5 shrink-0" />
          Purpose of Visit
        </TabsTrigger>
      </TabsList>

      <TabsContent value="visitor-type" className="mt-4 space-y-4">
        <MasterDataTabSection
          apiPath={API.MASTER_DATA_VISITOR_TYPES}
          label="Visitor Type"
          placeholderName="official, contractor, client, personal..."
        />
      </TabsContent>

      <TabsContent value="purpose-of-visit" className="mt-4 space-y-4">
        <MasterDataTabSection
          apiPath={API.MASTER_DATA_PURPOSES_OF_VISIT}
          label="Purpose of Visit"
          placeholderName="meeting, maintenance, delivery, interview..."
        />
      </TabsContent>
    </Tabs>
  );
}
