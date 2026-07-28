import type React from "react"
import { redirect } from "next/navigation"
import { WorkspaceProvider } from "@/components/providers/workspace-provider"
import { apiFetchServer, ApiError } from "@/lib/api-server"
import type { WorkspaceDetailResponse } from "@/lib/api-types"

// NOTE: the sidebar/auth shell is rendered by the parent app/(private)/layout.tsx,
// so this nested layout only adds workspace context. AppSidebar reads it via
// useWorkspaceOptional() to build workspace-prefixed links.
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params

  let detail: WorkspaceDetailResponse
  try {
    detail = await apiFetchServer<WorkspaceDetailResponse>(
      `/workspaces/${workspaceId}`,
      { workspaceId }
    )
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
      redirect("/workspaces")
    }
    throw err
  }

  return (
    <WorkspaceProvider workspace={detail.workspace} role={detail.role}>
      {children}
    </WorkspaceProvider>
  )
}
