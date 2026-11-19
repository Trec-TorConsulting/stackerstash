import { createContext, useContext } from "react";
import {
  canEditWorkspace,
  getWorkspaceRole,
  isWorkspaceOwner,
  type UserWorkspace,
  type WorkspaceRole,
} from "./api";

const WorkspaceContext = createContext<UserWorkspace | null>(null);

export const WorkspaceProvider = WorkspaceContext.Provider;

export function useActiveWorkspace(): UserWorkspace | null {
  return useContext(WorkspaceContext);
}

export function useWorkspacePermissions(overrideWorkspace?: UserWorkspace | null): {
  workspace: UserWorkspace | null;
  role: WorkspaceRole;
  canEdit: boolean;
  isOwner: boolean;
  isShared: boolean;
} {
  const ctxWorkspace = useContext(WorkspaceContext);
  const workspace = overrideWorkspace ?? ctxWorkspace;
  const role = getWorkspaceRole(workspace);
  return {
    workspace,
    role,
    canEdit: canEditWorkspace(workspace),
    isOwner: isWorkspaceOwner(workspace),
    isShared: Boolean(workspace?.is_shared),
  };
}
