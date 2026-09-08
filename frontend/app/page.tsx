"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Info, UploadCloud } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

interface Provenance {
  document_name: string;
  page_number: number;
  exact_quote: string;
}

interface Fact {
  fact_id: string;
  entity: string;
  attribute: string;
  value_raw: string;
  context_modifiers: string[];
  provenance: Provenance;
}

interface FactRelationship {
  relationship_id: string;
  relationship_type: string;
  explanation: string;
  reconciliation_dimension?: string | null;
  fact_a: Fact;
  fact_b: Fact;
}

const badgeStyles: Record<string, string> = {
  CORROBORATION: "bg-[#e8f0e8] text-[#356044] border-[#b8d1bb]",
  GENUINE_CONTRADICTION: "bg-[#f8e7e1] text-[#9d3e27] border-[#e2b3a4]",
  RECONCILED_CONTRADICTION: "bg-[#e4edf0] text-[#315f6b] border-[#b7d0d7]",
  REASONING_FAILURE_CASE: "bg-[#f5eddc] text-[#8b6425] border-[#ddc595]",
};

function typeIcon(type: string) {
  if (type === "CORROBORATION") return <CheckCircle2 className="h-5 w-5 text-[#356044]" />;
  if (type === "GENUINE_CONTRADICTION") return <AlertCircle className="h-5 w-5 text-[#9d3e27]" />;
  if (type === "RECONCILED_CONTRADICTION") return <Info className="h-5 w-5 text-[#315f6b]" />;
  return <FileText className="h-5 w-5 text-[#8b6425]" />;
}

export default function Dashboard() {
  const [cases, setCases] = useState<FactRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const loadCases = () => {
    setLoading(true);
    fetch(`${API_BASE}/api/demo-cases`)
      .then((response) => response.json())
      .then((data) => { setCases(data); setLoading(false); })
      .catch(() => { setMessage("Backend unavailable. Start FastAPI to load cases."); setLoading(false); });
  };

  useEffect(() => {
    const timer = window.setTimeout(loadCases, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(`Processing ${file.name}...`);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "Upload failed");
      setMessage(`${result.facts_extracted} facts extracted from ${result.filename}.`);
      loadCases();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const renderFact = (fact: Fact, label: string) => (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-[#9b6a38]">{label}</span>
        <span className="max-w-[210px] truncate bg-[#f1eee7] px-2 py-1 text-xs text-[#5d6862]" title={fact.provenance.document_name}>
          {fact.provenance.document_name}
        </span>
      </div>
      <div>
        <h3 className="text-xl font-bold text-[#18221f]">{fact.value_raw}</h3>
        <p className="text-sm font-medium text-[#69736d]">{fact.attribute} / {fact.entity}</p>
      </div>
      <blockquote className="border border-[#dedbd3] bg-[#f7f5f0] p-4 text-sm italic text-[#37443e]">
        “{fact.provenance.exact_quote}”
        <footer className="mt-3 text-xs font-bold not-italic text-[#b34d2e]">Page {fact.provenance.page_number}</footer>
      </blockquote>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#f4f1eb] px-5 py-8 text-[#18221f] sm:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-5 border-b border-[#c9c5bc] pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#b34d2e]">Superjoin / evidence desk</p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em]">Fact Knowledge Layer</h1>
            <p className="mt-2 max-w-xl text-sm text-[#5d6862]">Grounded claims, compared across documents, with the source still in view.</p>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-[#18221f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#b34d2e]">
            <UploadCloud className="h-4 w-4" />
            <span>{uploading ? "Processing..." : "Upload PDF"}</span>
            <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={handleUpload} disabled={uploading} />
          </label>
        </header>

        {message && <div className="border-l-4 border-[#b34d2e] bg-white px-4 py-3 text-sm text-[#5d6862]">{message}</div>}
        {loading ? <div className="py-20 text-center text-[#69736d]">Loading grounded cases...</div> : (
          <div className="space-y-8">
            {cases.map((relationship) => (
              <section key={relationship.relationship_id} className="overflow-hidden border border-[#d8d4cb] bg-white shadow-[0_10px_30px_rgba(24,34,31,0.05)]">
                <div className="flex items-start gap-4 border-b border-[#e4e0d8] bg-[#fbfaf7] p-6">
                  {typeIcon(relationship.relationship_type)}
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-3">
                      <h2 className="text-lg font-semibold capitalize">{relationship.relationship_type.replace(/_/g, " ").toLowerCase()}</h2>
                      <span className={`border px-2.5 py-0.5 text-xs font-medium ${badgeStyles[relationship.relationship_type] ?? "bg-gray-100"}`}>
                        {relationship.reconciliation_dimension ?? "Needs review"}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-[#5d6862]">{relationship.explanation}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 divide-y divide-[#e4e0d8] md:grid-cols-2 md:divide-x md:divide-y-0">
                  {renderFact(relationship.fact_a, "Document A")}
                  {renderFact(relationship.fact_b, "Document B")}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
