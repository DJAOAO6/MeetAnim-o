"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
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

      <Card className="mb-6 inline-flex p-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold transition ${activeTab === tab.id ? "bg-animeo text-white shadow-sm" : "text-animeo-muted hover:bg-animeo-soft hover:text-animeo-dark"}`}
          >
            <Icon name={tab.icon} className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </Card>

      {activeTab === "users" ? <UsersTab users={users} currentUserId={currentUserId} /> : <AuditLogTab entries={auditLog} />}
    </>
  );
}
