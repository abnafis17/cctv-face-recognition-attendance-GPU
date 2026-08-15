"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import VisitorMasterDataTab from "./VisitorMasterDataTab";
import UserMasterDataTab from "./UserMasterDataTab";

export default function MasterDataPanelPage() {
  return (
    <Tabs defaultValue="visitor">
      <TabsList className="bg-zinc-100/80 p-1">
        <TabsTrigger value="visitor">Visitor Module</TabsTrigger>
        <TabsTrigger value="user">User</TabsTrigger>
      </TabsList>

      <TabsContent value="visitor" className="space-y-4">
        <VisitorMasterDataTab />
      </TabsContent>

      <TabsContent value="user" className="space-y-4">
        <UserMasterDataTab />
      </TabsContent>
    </Tabs>
  );
}
