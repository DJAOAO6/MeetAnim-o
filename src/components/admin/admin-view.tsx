"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { Icon, type IconName } from "@/components/ui/icon";
import { UsersTab } from "@/components/admin/users-tab";
import { AuditLogTab } from "@/components/admin/audit-log-tab";
import type { AdminUser, AuditLogEntry } from "@/data/admin";

type AdminTab = "users" | "audit";

const tabs: Array<{ id: AdminTab; label: string; icon: IconName }> = [
  { id: "users", label: "Comptes", icon: "clients" },
  { id: "audit", label: "Journal d'audit", icon: "shield" },
];

export function AdminView({ users, auditLog, currentUserId }: { users: AdminUser[]; auditLog: AuditLogEntry[]; currentUserId: string }) {
  const [activeTab, setActiveTab] = useState<AdminTab>("users");

  return (
    <>
      <PageHeader title="Administration" description="Gestion des comptes et traçabilité des accès — réservé aux administrateurs." />

      <Card className="mb-6 inline-flex max-w-full p-1.5">
        <Tabs
          label="Onglets de l’administration"
          idPrefix="admin"
          tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label, icon: <Icon name={tab.icon} className="h-4 w-4" /> }))}
          value={activeTab}
          onChange={setActiveTab}
        />
      </Card>

      <TabPanel idPrefix="admin" tab={activeTab}>
        {activeTab === "users" ? <UsersTab users={users} currentUserId={currentUserId} /> : <AuditLogTab entries={auditLog} />}
      </TabPanel>
    </>
  );
}
