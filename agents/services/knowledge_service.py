"""Knowledge ingestion + retrieval (workspace-scoped Pinecone namespaces).

Pipeline: fetch/receive text -> chunk (VectorService algorithm) -> embed
(text-embedding-3-small) -> upsert to Pinecone namespace `ws_{workspace_id}` ->
persist knowledge_documents + knowledge_chunks rows in Supabase.

Runs synchronously for now (worker arrives in Phase 3); ingestion is capped at
MAX_CHUNKS chunks per document.
"""

import httpx
from bs4 import BeautifulSoup

from core.db import get_supabase_admin
from core.errors import DataError, ToolError
from core.logger import logger
from deps.workspace import WorkspaceContext
from services.vector_service import VectorService

MAX_CHUNKS = 20
FETCH_TIMEOUT_SECONDS = 20


def workspace_namespace(workspace_id: str) -> str:
    return f"ws_{workspace_id}"


class KnowledgeService:
    def __init__(self):
        self.vectors = VectorService()
        self.db = get_supabase_admin()

    # ── fetching ──────────────────────────────────────────────────

    async def fetch_website_text(self, url: str) -> tuple[str, str]:
        """Fetch a page with httpx and extract (title, text) via BeautifulSoup."""
        try:
            async with httpx.AsyncClient(
                follow_redirects=True,
                timeout=FETCH_TIMEOUT_SECONDS,
                headers={"User-Agent": "Mozilla/5.0 (compatible; DavisSDR/2.0)"},
            ) as client:
                resp = await client.get(url)
                resp.raise_for_status()
        except httpx.HTTPError as e:
            raise ToolError(f"Failed to fetch {url}: {e}") from e

        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "noscript", "svg", "header", "footer", "nav"]):
            tag.decompose()
        title = (soup.title.string or "").strip() if soup.title and soup.title.string else url
        text = " ".join(soup.get_text(separator=" ").split())
        if not text:
            raise DataError(f"No text content extracted from {url}")
        return title, text

    # ── ingestion ─────────────────────────────────────────────────

    async def ingest_text(
        self,
        ctx: WorkspaceContext,
        *,
        title: str,
        content: str,
        source_type: str,
        source_url: str | None = None,
    ) -> dict:
        """Chunk, embed, upsert to Pinecone, persist document + chunk rows."""
        namespace = workspace_namespace(ctx.workspace_id)

        document = (
            self.db.table("knowledge_documents")
            .insert(
                {
                    "organization_id": ctx.organization_id,
                    "workspace_id": ctx.workspace_id,
                    "title": title,
                    "source_type": source_type,
                    "source_url": source_url,
                    "status": "processing",
                    "created_by": ctx.user.id,
                }
            )
            .execute()
        ).data[0]
        document_id = document["id"]

        try:
            chunks = self.vectors.chunk_text(content)[:MAX_CHUNKS]
            vectors = []
            chunk_rows = []
            for i, chunk in enumerate(chunks):
                embedding = await self.vectors.create_embedding(chunk)
                vector_id = f"doc_{document_id}_chunk_{i}"
                vectors.append(
                    {
                        "id": vector_id,
                        "values": embedding,
                        "metadata": {
                            "workspace_id": ctx.workspace_id,
                            "document_id": document_id,
                            "chunk_index": i,
                            "source_url": source_url or "",
                            "title": title,
                            "chunk_text": chunk[:1000],
                        },
                    }
                )
                chunk_rows.append(
                    {
                        "organization_id": ctx.organization_id,
                        "workspace_id": ctx.workspace_id,
                        "document_id": document_id,
                        "chunk_index": i,
                        "content": chunk,
                        "embedding_id": vector_id,
                        "metadata": {"source_url": source_url, "title": title},
                        "created_by": ctx.user.id,
                    }
                )

            self.vectors.upsert_chunks(namespace, vectors)
            if chunk_rows:
                self.db.table("knowledge_chunks").insert(chunk_rows).execute()

            document = (
                self.db.table("knowledge_documents")
                .update({"status": "ready", "metadata": {"chunk_count": len(chunks)}})
                .eq("id", document_id)
                .execute()
            ).data[0]
            logger.info(
                "knowledge_document_ingested",
                document_id=document_id,
                chunks=len(chunks),
                namespace=namespace,
            )
            return {"document": document, "chunk_count": len(chunks)}
        except Exception:
            self.db.table("knowledge_documents").update({"status": "failed"}).eq(
                "id", document_id
            ).execute()
            raise

    async def ingest_website(self, ctx: WorkspaceContext, url: str) -> dict:
        title, text = await self.fetch_website_text(url)
        return await self.ingest_text(
            ctx, title=title, content=text, source_type="website", source_url=url
        )

    # ── deletion ──────────────────────────────────────────────────

    def delete_document(self, ctx: WorkspaceContext, document_id: str) -> None:
        """Delete a document: Pinecone vectors by id list + DB rows."""
        docs = (
            self.db.table("knowledge_documents")
            .select("id")
            .eq("id", document_id)
            .eq("workspace_id", ctx.workspace_id)
            .limit(1)
            .execute()
        ).data
        if not docs:
            raise DataError("Document not found")

        chunks = (
            self.db.table("knowledge_chunks")
            .select("embedding_id")
            .eq("document_id", document_id)
            .execute()
        ).data
        vector_ids = [c["embedding_id"] for c in chunks if c.get("embedding_id")]
        try:
            self.vectors.delete_vectors(workspace_namespace(ctx.workspace_id), vector_ids)
        except Exception as e:
            logger.error("pinecone_delete_failed", document_id=document_id, error=str(e))

        self.db.table("knowledge_chunks").delete().eq("document_id", document_id).execute()
        self.db.table("knowledge_documents").delete().eq("id", document_id).execute()

    # ── search ────────────────────────────────────────────────────

    async def search(self, ctx: WorkspaceContext, query: str, top_k: int = 5) -> list[dict]:
        embedding = await self.vectors.create_embedding(query)
        matches = self.vectors.query(
            workspace_namespace(ctx.workspace_id), embedding, top_k=top_k
        )
        results = []
        for m in matches:
            md = m.metadata or {}
            results.append(
                {
                    "score": m.score,
                    "chunk_text": md.get("chunk_text", ""),
                    "document_id": md.get("document_id"),
                    "chunk_index": md.get("chunk_index"),
                    "source_url": md.get("source_url"),
                    "title": md.get("title"),
                }
            )
        return results
