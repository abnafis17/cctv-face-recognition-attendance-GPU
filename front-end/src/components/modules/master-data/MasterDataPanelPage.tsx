"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import VisitorMasterDataTab from "./VisitorMasterDataTab";

export default function MasterDataPanelPage() {
  return (
    <Tabs defaultValue="visitor">
      <TabsList>
        <TabsTrigger value="visitor">Visitor Module</TabsTrigger>
      </TabsList>

      <TabsContent value="visitor" className="space-y-4">
        <VisitorMasterDataTab />
      </TabsContent>
    </Tabs>
  );
}
