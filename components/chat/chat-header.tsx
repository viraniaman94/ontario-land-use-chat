"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export function ChatHeader() {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-2 px-3 py-3 md:px-6">
        <SidebarTrigger className="hidden md:flex" />
        <Separator orientation="vertical" className="hidden h-5 md:block" />
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          ON
        </div>
        <div>
          <h1 className="text-sm font-semibold tracking-tight">
            Ontario Land Use Planning Feasibility Agent
          </h1>
          <p className="text-xs text-muted-foreground">
            Assess development feasibility across 41 planning documents
          </p>
        </div>
      </div>
    </header>
  );
}