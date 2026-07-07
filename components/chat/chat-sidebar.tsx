"use client";

import { Plus, MessageSquare, Trash2 } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import type { ConversationMeta } from "@/hooks/use-conversations";

interface ChatSidebarProps {
  conversations: ConversationMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: ChatSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            ON
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-semibold leading-tight">
              Feasibility Agent
            </p>
            <p className="text-xs text-muted-foreground leading-tight">
              41 planning documents
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <div className="px-2 py-1">
            <Button
              onClick={onNew}
              className="w-full justify-start gap-2"
              variant="default"
            >
              <Plus className="h-4 w-4" />
              <span className="group-data-[collapsible=icon]:hidden">
                New assessment
              </span>
            </Button>
          </div>

          <SidebarGroupLabel className="mt-2">Conversations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {conversations.length === 0 && (
                <li className="px-3 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                  No conversations yet.
                </li>
              )}
              {conversations.map((conv) => (
                <SidebarMenuItem key={conv.id}>
                  <SidebarMenuButton
                    isActive={conv.id === activeId}
                    onClick={() => onSelect(conv.id)}
                    tooltip={conv.title}
                    className="gap-2"
                  >
                    <MessageSquare className="h-4 w-4 shrink-0" />
                    <span className="truncate">{conv.title}</span>
                  </SidebarMenuButton>
                  <SidebarMenuAction
                    title="Delete conversation"
                    aria-label={`Delete ${conv.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(conv.id);
                    }}
                    showOnHover
                    className="text-muted-foreground hover:bg-sidebar-accent hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </SidebarMenuAction>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <p className="px-3 py-2 text-[11px] leading-tight text-muted-foreground group-data-[collapsible=icon]:hidden">
          Preliminary assessment only. Consult a registered professional planner
          (RPP) for formal opinions.
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}