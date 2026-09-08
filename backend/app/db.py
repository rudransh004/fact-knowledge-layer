from collections.abc import Generator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker
from sqlalchemy.types import JSON

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATABASE_URL = f"sqlite:///{PROJECT_ROOT / 'fact_knowledge_layer.db'}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class ExtractionJob(Base):
    __tablename__ = "extraction_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    filename: Mapped[str] = mapped_column(String(512))
    total_pages: Mapped[int] = mapped_column(Integer, default=0)
    processed_pages: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="QUEUED", index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_pdf: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    facts: Mapped[list["FactRecord"]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )


class FactRecord(Base):
    __tablename__ = "facts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("extraction_jobs.id"), index=True)
    fact_id: Mapped[str] = mapped_column(String(256), index=True)
    entity: Mapped[str] = mapped_column(String(512))
    attribute: Mapped[str] = mapped_column(String(512))
    value_raw: Mapped[str] = mapped_column(Text)
    value_normalized: Mapped[float | None] = mapped_column(nullable=True)
    unit: Mapped[str | None] = mapped_column(String(128), nullable=True)
    temporal_scope: Mapped[str | None] = mapped_column(String(256), nullable=True)
    context_modifiers: Mapped[list[str]] = mapped_column(JSON, default=list)
    ambiguity_notes: Mapped[list[str]] = mapped_column(JSON, default=list)
    document_name: Mapped[str] = mapped_column(String(512))
    page_number: Mapped[int] = mapped_column(Integer)
    exact_quote: Mapped[str] = mapped_column(Text)

    job: Mapped[ExtractionJob] = relationship(back_populates="facts")


class RelationshipRecord(Base):
    __tablename__ = "fact_relationships"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    relationship_id: Mapped[str] = mapped_column(String(256), unique=True)
    relationship_type: Mapped[str] = mapped_column(String(64))
    fact_a_id: Mapped[int | None] = mapped_column(ForeignKey("facts.id"), nullable=True)
    fact_b_id: Mapped[int | None] = mapped_column(ForeignKey("facts.id"), nullable=True)
    explanation: Mapped[str] = mapped_column(Text)
    reconciliation_dimension: Mapped[str | None] = mapped_column(String(512), nullable=True)


def init_db() -> None:
    Base.metadata.create_all(engine)


def get_db() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def fact_record_to_pydantic(record: FactRecord) -> dict[str, Any]:
    return {
        "fact_id": record.fact_id,
        "entity": record.entity,
        "attribute": record.attribute,
        "value_raw": record.value_raw,
        "value_normalized": record.value_normalized,
        "unit": record.unit,
        "temporal_scope": record.temporal_scope,
        "context_modifiers": record.context_modifiers or [],
        "ambiguity_notes": record.ambiguity_notes or [],
        "provenance": {
            "document_name": record.document_name,
            "page_number": record.page_number,
            "exact_quote": record.exact_quote,
        },
    }
