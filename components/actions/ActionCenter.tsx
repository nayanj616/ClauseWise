"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckSquare,
  CheckCircle2,
  Clock,
  Filter,
  FileText,
  PlusCircle,
  AlertCircle,
  ArrowRight,
  ListTodo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionCard } from "./ActionCard";
import type { ActionWithDetails, ActionStatus } from "@/types";
import { cn } from "@/lib/utils";

export interface ActionCenterProps {
  initialActions: ActionWithDetails[];
}

export function ActionCenter({ initialActions }: ActionCenterProps) {
  const [actionsList, setActionsList] = React.useState<ActionWithDetails[]>(initialActions);
  const [statusFilter, setStatusFilter] = React.useState<"all" | "open" | "completed">("all");
  const [documentFilter, setDocumentFilter] = React.useState<string>("all");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Extract distinct documents for the filter dropdown
  const availableDocuments = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const a of actionsList) {
      if (!map.has(a.documentId)) {
        map.set(a.documentId, a.document.title);
      }
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [actionsList]);

  // Filter actions based on document and status
  const filteredByDocument = React.useMemo(() => {
    if (documentFilter === "all") return actionsList;
    return actionsList.filter((a) => a.documentId === documentFilter);
  }, [actionsList, documentFilter]);

  const openActions = React.useMemo(() => {
    return filteredByDocument.filter((a) => a.status === "open");
  }, [filteredByDocument]);

  const completedActions = React.useMemo(() => {
    return filteredByDocument.filter((a) => a.status === "completed");
  }, [filteredByDocument]);

  // Toggle status handler (optimistic)
  const handleToggleStatus = async (actionId: string, currentStatus: ActionStatus) => {
    const newStatus: ActionStatus = currentStatus === "open" ? "completed" : "open";
    const previousActions = [...actionsList];

    // Optimistic update
    setActionsList((prev) =>
      prev.map((a) =>
        a.id === actionId
          ? {
              ...a,
              status: newStatus,
              completedAt: newStatus === "completed" ? new Date() : null,
              updatedAt: new Date(),
            }
          : a
      )
    );
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/actions/${actionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update action status");
      }
    } catch (err) {
      // Revert optimistic update
      setActionsList(previousActions);
      setErrorMessage(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  // Delete handler (optimistic)
  const handleDelete = async (actionId: string) => {
    const previousActions = [...actionsList];

    // Optimistic remove
    setActionsList((prev) => prev.filter((a) => a.id !== actionId));
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/actions/${actionId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete action");
      }
    } catch (err) {
      // Revert
      setActionsList(previousActions);
      setErrorMessage(err instanceof Error ? err.message : "Failed to delete action");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full p-4 sm:p-6 lg:p-8 animate-fade-in" data-testid="action-center-container">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ListTodo size={22} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Action Center
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Track and manage review items derived from document findings with verified evidence.
              </p>
            </div>
          </div>
        </div>

        {/* Counter Summary Pills */}
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="gap-1.5 py-1 px-3 text-xs bg-muted/40 font-medium">
            <Clock size={12} className="text-amber-500" aria-hidden="true" />
            <span>{`${openActions.length} Open`}</span>
          </Badge>
          <Badge variant="outline" className="gap-1.5 py-1 px-3 text-xs bg-muted/40 font-medium">
            <CheckCircle2 size={12} className="text-emerald-500" aria-hidden="true" />
            <span>{`${completedActions.length} Completed`}</span>
          </Badge>
        </div>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertCircle size={15} className="shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Filters & Tabs Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20 p-2.5 rounded-xl border">
        {/* Status Tabs */}
        <div
          role="tablist"
          aria-label="Filter actions by status"
          className="flex items-center gap-1.5"
        >
          <Button
            type="button"
            role="tab"
            aria-selected={statusFilter === "all"}
            variant={statusFilter === "all" ? "default" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("all")}
            className="text-xs h-8 gap-1.5"
            data-testid="filter-all-button"
          >
            <span>All</span>
            <span className="rounded-full bg-background/20 px-1.5 py-0.2 text-[10px] font-mono">
              {filteredByDocument.length}
            </span>
          </Button>

          <Button
            type="button"
            role="tab"
            aria-selected={statusFilter === "open"}
            variant={statusFilter === "open" ? "default" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("open")}
            className="text-xs h-8 gap-1.5"
            data-testid="filter-open-button"
          >
            <span>Open</span>
            <span className="rounded-full bg-background/20 px-1.5 py-0.2 text-[10px] font-mono">
              {openActions.length}
            </span>
          </Button>

          <Button
            type="button"
            role="tab"
            aria-selected={statusFilter === "completed"}
            variant={statusFilter === "completed" ? "default" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("completed")}
            className="text-xs h-8 gap-1.5"
            data-testid="filter-completed-button"
          >
            <span>Completed</span>
            <span className="rounded-full bg-background/20 px-1.5 py-0.2 text-[10px] font-mono">
              {completedActions.length}
            </span>
          </Button>
        </div>

        {/* Document Selector Dropdown */}
        {availableDocuments.length > 1 && (
          <div className="flex items-center gap-2">
            <Filter size={13} className="text-muted-foreground" aria-hidden="true" />
            <select
              value={documentFilter}
              onChange={(e) => setDocumentFilter(e.target.value)}
              aria-label="Filter actions by document"
              className="text-xs rounded-md border border-input bg-card px-2.5 py-1.5 text-foreground shadow-2xs focus:outline-none focus:ring-1 focus:ring-ring"
              data-testid="document-filter-select"
            >
              <option value="all">{`All Documents (${actionsList.length})`}</option>
              {availableDocuments.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {actionsList.length === 0 ? (
        /* Empty State: Zero actions across all documents */
        <div
          className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center bg-card space-y-4 shadow-2xs"
          data-testid="actions-empty-state"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckSquare size={28} aria-hidden="true" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h2 className="text-base font-semibold text-foreground">
              No Action Items Yet
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Open a document analysis workspace and select &ldquo;Add action&rdquo; on any finding to convert it into a trackable review item.
            </p>
          </div>
          <Button asChild size="sm" className="text-xs gap-1.5">
            <Link href="/documents">
              <FileText size={14} aria-hidden="true" />
              <span>Browse Documents</span>
              <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Status Tab: ALL */}
          {statusFilter === "all" && (
            <div className="space-y-6">
              {/* Open Section */}
              {openActions.length > 0 && (
                <div className="space-y-3" data-testid="open-actions-section">
                  <div className="flex items-center justify-between pb-1 border-b">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Clock size={13} className="text-amber-500" aria-hidden="true" />
                      <span>Open Review Items ({openActions.length})</span>
                    </h2>
                  </div>
                  <div className="grid gap-3">
                    {openActions.map((action) => (
                      <ActionCard
                        key={action.id}
                        action={action}
                        onToggleStatus={handleToggleStatus}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Completed Section */}
              {completedActions.length > 0 && (
                <div className="space-y-3 pt-2" data-testid="completed-actions-section">
                  <div className="flex items-center justify-between pb-1 border-b">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-emerald-500" aria-hidden="true" />
                      <span>Completed Items ({completedActions.length})</span>
                    </h2>
                  </div>
                  <div className="grid gap-3">
                    {completedActions.map((action) => (
                      <ActionCard
                        key={action.id}
                        action={action}
                        onToggleStatus={handleToggleStatus}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status Tab: OPEN */}
          {statusFilter === "open" && (
            <div className="space-y-3" data-testid="open-actions-list">
              {openActions.length > 0 ? (
                <div className="grid gap-3">
                  {openActions.map((action) => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      onToggleStatus={handleToggleStatus}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-8 text-center bg-card text-muted-foreground space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    All caught up!
                  </p>
                  <p className="text-xs">
                    You have completed all open review items for this selection.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Status Tab: COMPLETED */}
          {statusFilter === "completed" && (
            <div className="space-y-3" data-testid="completed-actions-list">
              {completedActions.length > 0 ? (
                <div className="grid gap-3">
                  {completedActions.map((action) => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      onToggleStatus={handleToggleStatus}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-8 text-center bg-card text-muted-foreground space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    No completed items yet
                  </p>
                  <p className="text-xs">
                    Mark items as completed in your open review list to see them here.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
