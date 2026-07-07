export function ChatHeader() {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-2 px-6 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
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