"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { API } from "@/config/axiosInstance";
import MasterDataTabSection from "./MasterDataTabSection";

export default function VisitorMasterDataTab() {
  return (
    <Tabs defaultValue="visitor-type" className="w-full">
      <TabsList className="bg-zinc-100/80 p-1">
        <TabsTrigger value="visitor-type" className="text-xs sm:text-sm">
          Visitor Type
        </TabsTrigger>
        <TabsTrigger value="purpose-of-visit" className="text-xs sm:text-sm">
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
