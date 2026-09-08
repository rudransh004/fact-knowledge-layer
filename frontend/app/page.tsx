"use client";

import { ChangeEvent, useEffect, useState, useRef } from "react";
import { 
  AlertCircle, 
  CheckCircle2, 
  FileText, 
  Info, 
  UploadCloud, 
  Clock, 
  Cpu, 
  Database, 
  Layers, 
  GitCompare, 
  Trash2, 
  RefreshCw, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  HelpCircle,
  Sparkles,
  FileCheck,
  Zap
} from "lucide-react";

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
  value_normalized?: number | null;
  unit?: string | null;
  temporal_scope?: string | null;
  context_modifiers: string[];
  ambiguity_notes?: string[];
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

interface ExtractionJob {
  job_id: string;
  filename: string;
  total_pages: number;
  processed_pages: number;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "QUOTA_EXHAUSTED" | "FAILED";
  error_message?: string | null;
  fact_count?: number;
  created_at?: string;
}

const badgeStyles: Record<string, string> = {
  CORROBORATION: "bg-[#e8f0e8] text-[#356044] border-[#b8d1bb]",
  GENUINE_CONTRADICTION: "bg-[#f8e7e1] text-[#9d3e27] border-[#e2b3a4]",
  RECONCILED_CONTRADICTION: "bg-[#e4edf0] text-[#315f6b] border-[#b7d0d7]",
  REASONING_FAILURE_CASE: "bg-[#f5eddc] text-[#8b6425] border-[#ddc595]",
};

function typeIcon(type: string) {
  if (type === "CORROBORATION") return <CheckCircle2 className="h-5 w-5 text-[#356044] shrink-0" />;
  if (type === "GENUINE_CONTRADICTION") return <AlertCircle className="h-5 w-5 text-[#9d3e27] shrink-0" />;
  if (type === "RECONCILED_CONTRADICTION") return <Info className="h-5 w-5 text-[#315f6b] shrink-0" />;
  return <FileText className="h-5 w-5 text-[#8b6425] shrink-0" />;
}

function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function Dashboard() {
  // Main Data States
  const [demoCases, setDemoCases] = useState<FactRelationship[]>([]);
  const [reconciledRelationships, setReconciledRelationships] = useState<FactRelationship[]>([]);
  const [extractedFacts, setExtractedFacts] = useState<Fact[]>([]);
  const [uploadedJobs, setUploadedJobs] = useState<ExtractionJob[]>([]);
  
  // UI & View States
  const [activeTab, setActiveTab] = useState<"relationships" | "facts" | "jobs" | "demo">("demo");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "info" | "success" | "error" } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showGuidance, setShowGuidance] = useState(true);

  // Active Job & Timer States
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<{ processed: number; total: number } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [estimatedEtaSeconds, setEstimatedEtaSeconds] = useState<number | null>(null);
  const [activePhase, setActivePhase] = useState<number>(0); // 1: PDF Parse, 2: LLM Extract, 3: DB Commit, 4: Match, 5: Reconcile

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Load all backend data
  const refreshAllData = async () => {
    try {
      // Load Demo Cases
      const demoRes = await fetch(`${API_BASE}/api/demo-cases`);
      if (demoRes.ok) {
        const data = await demoRes.json();
        setDemoCases(data);
      }

      // Load Reconciled Relationships
      const relRes = await fetch(`${API_BASE}/api/relationships`);
      if (relRes.ok) {
        const data = await relRes.json();
        setReconciledRelationships(data);
      }

      // Load Extracted Facts
      const factsRes = await fetch(`${API_BASE}/api/facts`);
      if (factsRes.ok) {
        const data = await factsRes.json();
        setExtractedFacts(data);
      }

      // Load Jobs Directory
      const jobsRes = await fetch(`${API_BASE}/api/jobs`);
      if (jobsRes.ok) {
        const data = await jobsRes.json();
        setUploadedJobs(data);
      }
    } catch {
      setMessage({ text: "Could not connect to backend FastAPI server at http://127.0.0.1:8000.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAllData();
  }, []);

  // Timer logic for active processing
  const startTimer = () => {
    stopTimer();
    startTimeRef.current = Date.now();
    setElapsedSeconds(0);
    setEstimatedEtaSeconds(null);
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedSeconds(elapsed);
      }
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    startTimeRef.current = null;
  };

  // Upload PDF Handler
  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setActivePhase(1); // Stage 1: PDF Parsing
    setMessage({ text: `Queuing and parsing ${file.name}...`, type: "info" });
    setJobProgress({ processed: 0, total: 0 });
    startTimer();

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "Upload failed");

      setActiveJobId(result.job_id);
      setActivePhase(2); // Stage 2: LLM Batch Extraction

      let finished = false;
      let lastProcessed = 0;
      let startTime = Date.now();

      while (!finished) {
        const jobResponse = await fetch(`${API_BASE}/api/jobs/${result.job_id}`);
        const job = await jobResponse.json();
        if (!jobResponse.ok) throw new Error(job.detail ?? "Could not read extraction progress");

        setJobProgress({ processed: job.processed_pages, total: job.total_pages });

        // Calculate dynamic ETA
        if (job.processed_pages > 0 && job.total_pages > 0) {
          const secondsElapsed = Math.max(1, (Date.now() - startTime) / 1000);
          const pagesPerSecond = job.processed_pages / secondsElapsed;
          const remainingPages = job.total_pages - job.processed_pages;
          if (pagesPerSecond > 0 && remainingPages > 0) {
            setEstimatedEtaSeconds(Math.ceil(remainingPages / pagesPerSecond));
          } else {
            setEstimatedEtaSeconds(0);
          }
        }

        if (job.status === "COMPLETED") {
          setActivePhase(3); // Stage 3: Database Commit
          setMessage({ 
            text: `Successfully extracted facts from ${job.filename} (${job.total_pages} pages). Upload another PDF or click "Run Reconciliation".`, 
            type: "success" 
          });
          finished = true;
          await refreshAllData();
          setActiveTab("facts");
        } else if (job.status === "QUOTA_EXHAUSTED") {
          throw new Error("API Quota Exhausted. Partial results saved to database.");
        } else if (job.status === "FAILED") {
          throw new Error(job.error_message ?? "Extraction failed.");
        } else {
          await new Promise((resolve) => window.setTimeout(resolve, 1200));
        }
      }
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Upload failed.", type: "error" });
    } finally {
      setUploading(false);
      stopTimer();
      setActivePhase(0);
      event.target.value = "";
    }
  };

  // Run Reconciliation Handler
  const runReconciliation = async () => {
    setReconciling(true);
    setActivePhase(4); // Stage 4: Candidate Matching
    setMessage({ text: "Matching entity/attribute pairs across documents...", type: "info" });
    startTimer();

    try {
      // Transition to Stage 5 after short delay
      setTimeout(() => setActivePhase(5), 1500);

      const response = await fetch(`${API_BASE}/api/reconcile`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "Reconciliation failed");

      await refreshAllData();
      setReconciledRelationships(result);
      setActiveTab("relationships");
      setMessage({ 
        text: `Reconciliation complete! ${result.length} cross-document relationships identified and saved.`, 
        type: "success" 
      });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Reconciliation failed.", type: "error" });
    } finally {
      setReconciling(false);
      stopTimer();
      setActivePhase(0);
    }
  };

  // Delete Job Handler
  const handleDeleteJob = async (jobId: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete ${filename} and its extracted facts?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/jobs/${jobId}`, { method: "DELETE" });
      if (res.ok) {
        setMessage({ text: `Deleted ${filename}.`, type: "info" });
        refreshAllData();
      }
    } catch {
      setMessage({ text: "Failed to delete job.", type: "error" });
    }
  };

  // Clear All Data Handler
  const handleClearAll = async () => {
    if (!confirm("Clear all custom uploaded files, facts, and reconciled relationships from the database?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/facts`, { method: "DELETE" });
      if (res.ok) {
        setMessage({ text: "Cleared custom uploaded documents and facts.", type: "info" });
        refreshAllData();
        setActiveTab("demo");
      }
    } catch {
      setMessage({ text: "Failed to clear database.", type: "error" });
    }
  };

  // Calculated helper values
  const progressPercent = jobProgress && jobProgress.total > 0
    ? Math.round((jobProgress.processed / jobProgress.total) * 100)
    : 0;

  const activeRelationships = activeTab === "demo" ? demoCases : reconciledRelationships;

  const filteredRelationships = activeRelationships.filter((rel) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      rel.relationship_type.toLowerCase().includes(q) ||
      rel.explanation.toLowerCase().includes(q) ||
      (rel.reconciliation_dimension && rel.reconciliation_dimension.toLowerCase().includes(q)) ||
      rel.fact_a.entity.toLowerCase().includes(q) ||
      rel.fact_b.entity.toLowerCase().includes(q) ||
      rel.fact_a.attribute.toLowerCase().includes(q) ||
      rel.fact_b.attribute.toLowerCase().includes(q)
    );
  });

  const filteredFacts = extractedFacts.filter((fact) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      fact.entity.toLowerCase().includes(q) ||
      fact.attribute.toLowerCase().includes(q) ||
      fact.value_raw.toLowerCase().includes(q) ||
      fact.provenance.document_name.toLowerCase().includes(q) ||
      fact.provenance.exact_quote.toLowerCase().includes(q)
    );
  });

  // Render a Fact Card
  const renderFact = (fact: Fact, label: string) => (
    <div className="space-y-4 p-6 bg-white flex flex-col justify-between">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-[#9b6a38] px-2 py-0.5 bg-[#f7f2e9] border border-[#e8ddcb] rounded">
            {label}
          </span>
          <span className="max-w-[220px] truncate rounded bg-[#f1eee7] px-2.5 py-1 text-xs font-semibold text-[#5d6862]" title={fact.provenance.document_name}>
            📄 {fact.provenance.document_name}
          </span>
        </div>
        <div>
          <h3 className="text-2xl font-bold text-[#18221f]">{fact.value_raw}</h3>
          <p className="text-sm font-medium text-[#69736d] mt-1">
            <span className="font-semibold text-[#18221f]">{fact.attribute}</span> &bull; {fact.entity}
          </p>
          {fact.temporal_scope && (
            <span className="mt-2 inline-block rounded bg-[#e8f0e8] px-2 py-0.5 text-xs font-bold text-[#356044]">
              📅 {fact.temporal_scope}
            </span>
          )}
        </div>
      </div>
      <blockquote className="relative rounded border-l-4 border-[#b34d2e] bg-[#f7f5f0] p-4 text-sm italic text-[#37443e] space-y-2">
        <p className="leading-relaxed">“{fact.provenance.exact_quote}”</p>
        <footer className="text-xs font-bold not-italic text-[#b34d2e] flex items-center justify-between">
          <span>Source Page {fact.provenance.page_number}</span>
          <span className="text-[10px] uppercase font-semibold text-[#8b8e8b]">Verbatim Evidence</span>
        </footer>
      </blockquote>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#f4f1eb] px-4 py-8 text-[#18221f] sm:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        
        {/* Header Banner */}
        <header className="flex flex-col gap-6 border-b border-[#c9c5bc] pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded bg-[#18221f] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white">
                Superjoin / Evidence Desk
              </span>
              <span className="rounded border border-[#b7d0d7] bg-[#e4edf0] px-2.5 py-1 text-[11px] font-bold text-[#315f6b]">
                Gemini 3.5 Flash-lite & Interactions API
              </span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-[-0.04em] text-[#18221f] sm:text-5xl">
              Fact Knowledge Layer
            </h1>
            <p className="mt-2 max-w-2xl text-base text-[#5d6862]">
              Evidence-grounded claims, cross-document reconciliation, and automated contradiction detection with verifiable page citations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={runReconciliation}
              disabled={reconciling || uploading || uploadedJobs.length === 0}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded bg-[#b34d2e] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#963f24] disabled:cursor-not-allowed disabled:opacity-50"
              title={uploadedJobs.length === 0 ? "Upload at least 1 document first" : "Reconcile candidate pairs across uploaded documents"}
            >
              <GitCompare className={`h-4 w-4 ${reconciling ? "animate-spin" : ""}`} />
              <span>{reconciling ? "Reconciling Claims..." : "Run Reconciliation"}</span>
            </button>

            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded bg-[#18221f] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#2c3d38] disabled:cursor-not-allowed disabled:opacity-50">
              <UploadCloud className="h-4 w-4" />
              <span>{uploading ? "Extracting..." : "Upload PDF"}</span>
              <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={handleUpload} disabled={uploading || reconciling} />
            </label>
          </div>
        </header>

        {/* Interactive Step-by-Step Guidance Banner */}
        <section className="rounded-lg border border-[#d8d4cb] bg-white p-5 shadow-sm transition">
          <div className="flex items-center justify-between border-b border-[#eeeae2] pb-3">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-[#b34d2e]" />
              <h2 className="text-base font-bold text-[#18221f]">How This Assignment Works & Workflow Guide</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowGuidance(!showGuidance)}
              className="flex items-center gap-1 text-xs font-semibold text-[#69736d] hover:text-[#18221f]"
            >
              <span>{showGuidance ? "Hide Workflow Steps" : "Show Workflow Steps"}</span>
              {showGuidance ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {showGuidance && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              
              {/* Step 1 */}
              <div className="rounded border border-[#e4e0d8] bg-[#fbfaf7] p-4 relative space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#18221f] text-xs font-bold text-white">1</span>
                  <span className="rounded bg-[#f5eddc] px-2 py-0.5 text-[10px] font-bold text-[#8b6425]">
                    Requires 2+ PDFs
                  </span>
                </div>
                <h3 className="font-bold text-[#18221f] text-sm">Upload Documents</h3>
                <p className="text-xs text-[#5d6862] leading-relaxed">
                  Upload <strong>at least 2 different PDF documents</strong> (e.g. Prospectus & Annual Report) so the engine can match cross-document claims.
                </p>
              </div>

              {/* Step 2 */}
              <div className="rounded border border-[#e4e0d8] bg-[#fbfaf7] p-4 relative space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#18221f] text-xs font-bold text-white">2</span>
                  <span className="rounded bg-[#e8f0e8] px-2 py-0.5 text-[10px] font-bold text-[#356044]">
                    Batch 10 Pages
                  </span>
                </div>
                <h3 className="font-bold text-[#18221f] text-sm">Verbatim Fact Extraction</h3>
                <p className="text-xs text-[#5d6862] leading-relaxed">
                  PyMuPDF parses PDF pages. Gemini 3.5 Flash-lite extracts atomic facts with 1-based page numbers and verbatim quotes.
                </p>
              </div>

              {/* Step 3 */}
              <div className="rounded border border-[#e4e0d8] bg-[#fbfaf7] p-4 relative space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#18221f] text-xs font-bold text-white">3</span>
                  <span className="rounded bg-[#e4edf0] px-2 py-0.5 text-[10px] font-bold text-[#315f6b]">
                    SequenceMatcher ≥ 0.72
                  </span>
                </div>
                <h3 className="font-bold text-[#18221f] text-sm">Cross-Doc Reconciliation</h3>
                <p className="text-xs text-[#5d6862] leading-relaxed">
                  Click <strong>Run Reconciliation</strong> to find matching entity/attribute pairs across files and evaluate relationships.
                </p>
              </div>

              {/* Step 4 */}
              <div className="rounded border border-[#e4e0d8] bg-[#fbfaf7] p-4 relative space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#18221f] text-xs font-bold text-white">4</span>
                  <span className="rounded bg-[#f8e7e1] px-2 py-0.5 text-[10px] font-bold text-[#9d3e27]">
                    4 Classifications
                  </span>
                </div>
                <h3 className="font-bold text-[#18221f] text-sm">Audit Rationales</h3>
                <p className="text-xs text-[#5d6862] leading-relaxed">
                  Inspect Corroborations, Contradictions, and Reconciled Scope differences (Standalone vs Consolidated) with page proof.
                </p>
              </div>

            </div>
          )}
        </section>

        {/* Notifications & System Messages */}
        {message && (
          <div className={`flex items-start justify-between rounded border-l-4 p-4 shadow-sm ${
            message.type === "error" ? "border-red-600 bg-red-50 text-red-900" :
            message.type === "success" ? "border-emerald-600 bg-emerald-50 text-emerald-900" :
            "border-[#b34d2e] bg-white text-[#18221f]"
          }`}>
            <div className="flex items-center gap-3">
              {message.type === "error" ? <AlertCircle className="h-5 w-5 text-red-600 shrink-0" /> :
               message.type === "success" ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" /> :
               <Sparkles className="h-5 w-5 text-[#b34d2e] shrink-0" />}
              <p className="text-sm font-medium">{message.text}</p>
            </div>
            <button onClick={() => setMessage(null)} className="text-xs font-bold uppercase hover:opacity-75">
              Dismiss
            </button>
          </div>
        )}

        {/* Live Progress, ETA Timer & Technical Pipeline Visualizer */}
        {(uploading || reconciling) && (
          <section className="rounded-lg border-2 border-[#b34d2e] bg-white p-6 shadow-md space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#eeeae2] pb-4">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded bg-[#b34d2e] px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
                  <Zap className="h-3.5 w-3.5 animate-pulse" /> Active Backend Execution
                </span>
                <h3 className="text-xl font-bold text-[#18221f] mt-1">
                  {uploading ? "Processing PDF & Extracting Fact Knowledge Layer" : "Reconciling Cross-Document Claims"}
                </h3>
              </div>
              <div className="flex items-center gap-4 bg-[#f7f5f0] p-3 rounded border border-[#e4e0d8]">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#b34d2e] animate-spin" />
                  <div className="text-xs">
                    <span className="block text-[#69736d] font-medium">Elapsed</span>
                    <span className="font-mono font-bold text-[#18221f]">{formatSeconds(elapsedSeconds)}</span>
                  </div>
                </div>
                <div className="h-8 w-px bg-[#d8d4cb]" />
                <div className="text-xs">
                  <span className="block text-[#69736d] font-medium">Estimated ETA</span>
                  <span className="font-mono font-bold text-[#b34d2e]">
                    {estimatedEtaSeconds !== null ? `~${formatSeconds(estimatedEtaSeconds)}` : "Calculating..."}
                  </span>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            {uploading && jobProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold text-[#18221f]">
                  <span>Page Extraction Progress</span>
                  <span>{jobProgress.processed} / {jobProgress.total || "..."} Pages ({progressPercent}%)</span>
                </div>
                <div className="h-3 overflow-hidden rounded bg-[#e8e3da]">
                  <div className="h-full bg-[#b34d2e] transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            )}

            {/* Technical Backend Process Pipeline Steps */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#69736d]">Backend Pipeline Execution Stages</h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                
                {/* Stage 1 */}
                <div className={`rounded p-3 border text-xs space-y-1 ${activePhase >= 1 ? "bg-[#f0f7f4] border-[#a3c9b8] text-[#1e4d39]" : "bg-[#f9f8f6] border-[#e4e0d8] opacity-60"}`}>
                  <div className="flex items-center justify-between">
                    <FileText className="h-4 w-4 text-[#356044]" />
                    <span className="font-bold">01</span>
                  </div>
                  <div className="font-bold">PDF Parsing</div>
                  <div className="text-[10px] opacity-80">PyMuPDF 1-based page chunking</div>
                </div>

                {/* Stage 2 */}
                <div className={`rounded p-3 border text-xs space-y-1 ${activePhase >= 2 ? "bg-[#eaf4f8] border-[#a1cdde] text-[#1b4b5e]" : "bg-[#f9f8f6] border-[#e4e0d8] opacity-60"}`}>
                  <div className="flex items-center justify-between">
                    <Cpu className="h-4 w-4 text-[#315f6b]" />
                    <span className="font-bold">02</span>
                  </div>
                  <div className="font-bold">Gemini LLM</div>
                  <div className="text-[10px] opacity-80">Interactions API Pydantic JSON</div>
                </div>

                {/* Stage 3 */}
                <div className={`rounded p-3 border text-xs space-y-1 ${activePhase >= 3 ? "bg-[#f7f2e9] border-[#d8c39e] text-[#5e4318]" : "bg-[#f9f8f6] border-[#e4e0d8] opacity-60"}`}>
                  <div className="flex items-center justify-between">
                    <Database className="h-4 w-4 text-[#8b6425]" />
                    <span className="font-bold">03</span>
                  </div>
                  <div className="font-bold">DB Commit</div>
                  <div className="text-[10px] opacity-80">SQLite FactRecord quote storage</div>
                </div>

                {/* Stage 4 */}
                <div className={`rounded p-3 border text-xs space-y-1 ${activePhase >= 4 ? "bg-[#f3eef8] border-[#cbb8e3] text-[#4d2778]" : "bg-[#f9f8f6] border-[#e4e0d8] opacity-60"}`}>
                  <div className="flex items-center justify-between">
                    <Layers className="h-4 w-4 text-[#6b359c]" />
                    <span className="font-bold">04</span>
                  </div>
                  <div className="font-bold">Matching</div>
                  <div className="text-[10px] opacity-80">SequenceMatcher ratio ≥ 0.72</div>
                </div>

                {/* Stage 5 */}
                <div className={`rounded p-3 border text-xs space-y-1 ${activePhase >= 5 ? "bg-[#fceee9] border-[#f0b9a8] text-[#802c14]" : "bg-[#f9f8f6] border-[#e4e0d8] opacity-60"}`}>
                  <div className="flex items-center justify-between">
                    <GitCompare className="h-4 w-4 text-[#b34d2e]" />
                    <span className="font-bold">05</span>
                  </div>
                  <div className="font-bold">Reconcile</div>
                  <div className="text-[10px] opacity-80">Classify Scope & Rationale</div>
                </div>

              </div>
            </div>
          </section>
        )}

        {/* Tab Navigation & Search Bar */}
        <div className="flex flex-col gap-4 border-b border-[#c9c5bc] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex flex-wrap items-center gap-2">
            
            <button
              type="button"
              onClick={() => setActiveTab("demo")}
              className={`rounded px-4 py-2.5 text-sm font-bold transition ${
                activeTab === "demo" ? "bg-[#18221f] text-white shadow-sm" : "bg-white text-[#5d6862] hover:bg-[#e8e3da]"
              }`}
            >
              🧪 Evaluator Demo Cases ({demoCases.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("relationships")}
              className={`rounded px-4 py-2.5 text-sm font-bold transition flex items-center gap-2 ${
                activeTab === "relationships" ? "bg-[#18221f] text-white shadow-sm" : "bg-white text-[#5d6862] hover:bg-[#e8e3da]"
              }`}
            >
              <span>⚖️ Reconciled Relationships</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${
                activeTab === "relationships" ? "bg-[#b34d2e] text-white" : "bg-[#e8e3da] text-[#18221f]"
              }`}>
                {reconciledRelationships.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("facts")}
              className={`rounded px-4 py-2.5 text-sm font-bold transition flex items-center gap-2 ${
                activeTab === "facts" ? "bg-[#18221f] text-white shadow-sm" : "bg-white text-[#5d6862] hover:bg-[#e8e3da]"
              }`}
            >
              <span>📊 Extracted Facts Store</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${
                activeTab === "facts" ? "bg-[#b34d2e] text-white" : "bg-[#e8e3da] text-[#18221f]"
              }`}>
                {extractedFacts.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("jobs")}
              className={`rounded px-4 py-2.5 text-sm font-bold transition flex items-center gap-2 ${
                activeTab === "jobs" ? "bg-[#18221f] text-white shadow-sm" : "bg-white text-[#5d6862] hover:bg-[#e8e3da]"
              }`}
            >
              <span>📁 Uploaded Documents</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${
                activeTab === "jobs" ? "bg-[#b34d2e] text-white" : "bg-[#e8e3da] text-[#18221f]"
              }`}>
                {uploadedJobs.length}
              </span>
            </button>

          </nav>

          {/* Search Input */}
          <div className="relative min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#8b8e8b]" />
            <input
              type="text"
              placeholder="Search facts, entities, quotes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded border border-[#d8d4cb] bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b34d2e]"
            />
          </div>
        </div>

        {/* Tab Content 1: Demo Cases & Reconciled Relationships */}
        {(activeTab === "demo" || activeTab === "relationships") && (
          <div className="space-y-6">
            
            {activeTab === "demo" && (
              <div className="rounded border border-[#b7d0d7] bg-[#e4edf0] p-4 text-xs text-[#315f6b] flex items-center justify-between">
                <p>
                  <strong>Pre-configured Mandatory Assignment Benchmarks:</strong> Showcasing 4 grounded Delhivery dataset cases (Corroboration, Contradiction, Standalone vs Consolidated Scope, and Footnote dependency).
                </p>
                <button
                  onClick={() => setActiveTab("relationships")}
                  className="font-bold underline hover:text-[#18221f] shrink-0 ml-4"
                >
                  View Custom Reconciled Uploads &rarr;
                </button>
              </div>
            )}

            {activeTab === "relationships" && reconciledRelationships.length === 0 && (
              <div className="rounded-lg border-2 border-dashed border-[#d8d4cb] bg-white p-12 text-center space-y-3">
                <GitCompare className="mx-auto h-10 w-10 text-[#8b8e8b]" />
                <h3 className="text-lg font-bold text-[#18221f]">No Reconciled Relationships Identified Yet</h3>
                <p className="max-w-md mx-auto text-sm text-[#5d6862]">
                  Upload <strong>2 or more PDF documents</strong>, then click <strong>Run Reconciliation</strong> at the top to trigger cross-document candidate pair matching.
                </p>
              </div>
            )}

            {loading ? (
              <div className="py-20 text-center text-[#69736d] font-semibold">Loading Fact Knowledge Layer...</div>
            ) : (
              <div className="space-y-6">
                {filteredRelationships.map((relationship, idx) => (
                  <section key={`${relationship.relationship_id}-${idx}`} className="overflow-hidden rounded-lg border border-[#d8d4cb] bg-white shadow-sm transition hover:shadow-md">
                    
                    {/* Header Classification Bar */}
                    <div className="flex items-start gap-4 border-b border-[#e4e0d8] bg-[#fbfaf7] p-6">
                      {typeIcon(relationship.relationship_type)}
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="text-xl font-bold tracking-tight text-[#18221f] capitalize">
                            {relationship.relationship_type.replace(/_/g, " ").toLowerCase()}
                          </h2>
                          <span className={`border px-3 py-0.5 text-xs font-bold rounded ${badgeStyles[relationship.relationship_type] ?? "bg-gray-100"}`}>
                            {relationship.reconciliation_dimension ?? "General Metric"}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed text-[#4a544f] font-medium">{relationship.explanation}</p>
                      </div>
                    </div>

                    {/* Side-by-Side Fact Comparison */}
                    <div className="grid grid-cols-1 divide-y divide-[#e4e0d8] md:grid-cols-2 md:divide-x md:divide-y-0">
                      {renderFact(relationship.fact_a, "Document A Claim")}
                      {renderFact(relationship.fact_b, "Document B Claim")}
                    </div>

                  </section>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab Content 2: Searchable Facts Store */}
        {activeTab === "facts" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#18221f]">Extracted Facts Database ({filteredFacts.length})</h2>
              {extractedFacts.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 hover:text-red-900 border border-red-200 bg-red-50 px-3 py-1.5 rounded"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear All Facts
                </button>
              )}
            </div>

            {filteredFacts.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-[#d8d4cb] bg-white p-12 text-center space-y-3">
                <FileCheck className="mx-auto h-10 w-10 text-[#8b8e8b]" />
                <h3 className="text-lg font-bold text-[#18221f]">No Facts Found</h3>
                <p className="text-sm text-[#5d6862]">Upload a PDF document to extract grounded facts automatically.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {filteredFacts.map((fact, idx) => (
                  <div key={`${fact.provenance.document_name}-${fact.provenance.page_number}-${fact.fact_id}-${idx}`} className="rounded border border-[#d8d4cb] bg-white p-5 space-y-3 shadow-sm flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="rounded bg-[#f1eee7] px-2.5 py-1 text-xs font-bold text-[#5d6862] truncate max-w-[240px]">
                          📄 {fact.provenance.document_name}
                        </span>
                        <span className="text-xs font-bold text-[#b34d2e]">Page {fact.provenance.page_number}</span>
                      </div>
                      <h4 className="text-xl font-extrabold text-[#18221f]">{fact.value_raw}</h4>
                      <p className="text-xs font-semibold text-[#69736d]">
                        {fact.attribute} &bull; <span className="text-[#18221f]">{fact.entity}</span>
                      </p>
                      {fact.temporal_scope && (
                        <span className="inline-block rounded bg-[#e8f0e8] px-2 py-0.5 text-[11px] font-bold text-[#356044]">
                          {fact.temporal_scope}
                        </span>
                      )}
                    </div>
                    <blockquote className="border-l-2 border-[#b34d2e] bg-[#f7f5f0] p-3 text-xs italic text-[#37443e]">
                      “{fact.provenance.exact_quote}”
                    </blockquote>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab Content 3: Uploaded Documents Directory */}
        {activeTab === "jobs" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#18221f]">Uploaded Document Directory ({uploadedJobs.length})</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={refreshAllData}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#18221f] border border-[#d8d4cb] bg-white px-3 py-1.5 rounded hover:bg-[#e8e3da]"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh List
                </button>
              </div>
            </div>

            {uploadedJobs.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-[#d8d4cb] bg-white p-12 text-center space-y-3">
                <FileText className="mx-auto h-10 w-10 text-[#8b8e8b]" />
                <h3 className="text-lg font-bold text-[#18221f]">No Uploaded Documents</h3>
                <p className="text-sm text-[#5d6862]">Use the "Upload PDF" button at the top to add documents to the knowledge layer.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {uploadedJobs.map((job) => (
                  <div key={job.job_id} className="rounded-lg border border-[#d8d4cb] bg-white p-5 space-y-4 shadow-sm flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-base text-[#18221f] break-all leading-tight">
                          📄 {job.filename}
                        </div>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded border uppercase shrink-0 ${
                          job.status === "COMPLETED" ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                          job.status === "PROCESSING" ? "bg-amber-50 text-amber-800 border-amber-200" :
                          "bg-red-50 text-red-800 border-red-200"
                        }`}>
                          {job.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-[#5d6862] bg-[#f9f8f6] p-3 rounded">
                        <div>
                          <span className="block text-[10px] font-semibold uppercase text-[#8b8e8b]">Page Progress</span>
                          <span className="font-bold text-[#18221f]">{job.processed_pages} / {job.total_pages}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-semibold uppercase text-[#8b8e8b]">Extracted Facts</span>
                          <span className="font-bold text-[#b34d2e]">{job.fact_count ?? 0} Facts</span>
                        </div>
                      </div>

                      {job.error_message && (
                        <p className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">
                          {job.error_message}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[#eeeae2]">
                      <span className="text-[11px] text-[#8b8e8b]">
                        {job.created_at ? new Date(job.created_at).toLocaleTimeString() : "Just now"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteJob(job.job_id, job.filename)}
                        className="text-xs font-bold text-red-600 hover:text-red-800 flex items-center gap-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  );
}
