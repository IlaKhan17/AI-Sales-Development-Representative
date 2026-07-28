"""Knowledge base endpoints: website/document ingestion, claims, search.

All endpoints are workspace-scoped via get_workspace_context (X-Workspace-Id).
"""

from fastapi import APIRouter, Depends, HTTPException

from core.db import get_supabase_admin
from core.errors import DataError, ToolError
from deps.workspace import WorkspaceContext, get_workspace_context, require_role
from schemas.knowledge import (
    ClaimCreateRequest,
    ClaimReviewRequest,
    DocumentUploadRequest,
    IngestWebsiteRequest,
    KnowledgeSearchRequest,
)

router = APIRouter(prefix="/knowledge", tags=["knowledge"], dependencies=[Depends(get_workspace_context)])


def _service():
    # Lazy import/instantiation: VectorService connects to Pinecone in __init__.
    from services.knowledge_service import KnowledgeService

    return KnowledgeService()


@router.post("/ingest-website", status_code=201)
async def ingest_website(
    body: IngestWebsiteRequest, ctx: WorkspaceContext = Depends(get_workspace_context)
):
    try:
        return await _service().ingest_website(ctx, str(body.url))
    except ToolError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except DataError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/documents", status_code=201)
async def upload_document(
    body: DocumentUploadRequest, ctx: WorkspaceContext = Depends(get_workspace_context)
):
    return await _service().ingest_text(
        ctx, title=body.title, content=body.content, source_type="upload"
    )


@router.get("/documents")
async def list_documents(ctx: WorkspaceContext = Depends(get_workspace_context)):
    db = get_supabase_admin()
    documents = (
        db.table("knowledge_documents")
        .select("id, title, source_type, source_url, status, metadata, created_at, created_by")
        .eq("workspace_id", ctx.workspace_id)
        .order("created_at", desc=True)
        .execute()
    ).data
    return {"documents": documents}


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(
    document_id: str, ctx: WorkspaceContext = Depends(get_workspace_context)
):
    try:
        _service().delete_document(ctx, document_id)
    except DataError:
        raise HTTPException(status_code=404, detail="Document not found")


# ── approved claims ───────────────────────────────────────────────


@router.post("/claims", status_code=201)
async def create_claim(
    body: ClaimCreateRequest, ctx: WorkspaceContext = Depends(get_workspace_context)
):
    db = get_supabase_admin()
    claim = (
        db.table("approved_claims")
        .insert(
            {
                "organization_id": ctx.organization_id,
                "workspace_id": ctx.workspace_id,
                "product_profile_id": body.product_profile_id,
                "claim": body.claim,
                "source_url": body.source_url,
                "source_title": body.source_title,
                "evidence_snippet": body.evidence_snippet,
                "observed_at": body.observed_at,
                "confidence": body.confidence,
                "review_status": "pending",
                "created_by": ctx.user.id,
            }
        )
        .execute()
    ).data[0]
    return claim


@router.get("/claims")
async def list_claims(
    review_status: str | None = None,
    ctx: WorkspaceContext = Depends(get_workspace_context),
):
    db = get_supabase_admin()
    q = db.table("approved_claims").select("*").eq("workspace_id", ctx.workspace_id)
    if review_status:
        q = q.eq("review_status", review_status)
    claims = q.order("created_at", desc=True).execute().data
    return {"claims": claims}


@router.patch("/claims/{claim_id}")
async def review_claim(
    claim_id: str,
    body: ClaimReviewRequest,
    ctx: WorkspaceContext = Depends(require_role("owner", "admin")),
):
    db = get_supabase_admin()
    updated = (
        db.table("approved_claims")
        .update({"review_status": body.review_status})
        .eq("id", claim_id)
        .eq("workspace_id", ctx.workspace_id)
        .execute()
    ).data
    if not updated:
        raise HTTPException(status_code=404, detail="Claim not found")
    return updated[0]


# ── semantic search ───────────────────────────────────────────────


@router.post("/search")
async def search_knowledge(
    body: KnowledgeSearchRequest, ctx: WorkspaceContext = Depends(get_workspace_context)
):
    results = await _service().search(ctx, body.query, top_k=body.top_k)
    return {"query": body.query, "results": results}
