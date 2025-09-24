import React, { useCallback, useMemo, useRef, useState } from "react";

export default function ChatPane({ 
  legalOn, 
  onCitationClick, 
  pageTexts = [], 
  messages = [],
  isLoading = false,
  error = null,
  onSendQuestion,
  documentId
}) {
  const [input, setInput] = useState("");

  // pageTexts is now passed as a prop, no need to memoize

  const addMsg = useCallback((m) => setMessages((prev) => [...prev, m]), []);

  const normalize = (s) =>
    (s || "").toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();

  const randomQuoteFromText = (text, minLen = 40, maxLen = 120) => {
    const clean = (text || "").replace(/\s+/g, " ").trim();
    if (!clean) return "";
    if (clean.length <= minLen + 10) return clean;
    const len = Math.floor(Math.random() * (maxLen - minLen + 1)) + minLen;
    const start = Math.floor(Math.random() * Math.max(1, clean.length - len - 1));
    let snippet = clean.slice(start, start + len);
    snippet = snippet.replace(/^[^A-Za-z0-9]+/, "").replace(/[^A-Za-z0-9]+$/, "");
    return snippet;
  };

  const makeCitations = useCallback((count = 2) => {
    const citations = [];
    if (!pageTexts?.length) {
      return [{ page: 1, quote: "No PDF loaded; this is a placeholder quote." }];
    }
    
    // Filter out empty pages and get valid text
    const validPages = pageTexts.filter(p => p.text && p.text.trim().length > 20);
    if (validPages.length === 0) {
      return [{ page: 1, quote: "PDF loaded but no text found." }];
    }
    
    const indices = new Set();
    while (indices.size < Math.min(count, validPages.length)) {
      indices.add(Math.floor(Math.random() * validPages.length));
    }
    
    for (const idx of indices) {
      const { page, text } = validPages[idx];
      const quote = randomQuoteFromText(text);
      if (quote) {
        citations.push({ page, quote });
        console.log(`Generated citation for page ${page}:`, quote);
      }
    }
    return citations;
  }, [pageTexts]);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q) return;
    if (!documentId) {
      return; // No document loaded
    }

    setInput("");
    await onSendQuestion(q);
  }, [input, documentId, onSendQuestion]);

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="w-16 text-right text-xs text-[var(--muted)] pt-1">{m.who}</div>
            <div className={`flex-1 rounded-2xl border p-3 ${
              m.isError 
                ? "border-red-500/50 bg-red-900/20" 
                : "border-[#1f2836] bg-[var(--panel)]"
            }`}>
              <div className={m.who === "Answer" ? "font-semibold" : ""}>{m.text}</div>

              {/* Badges */}
              {m.badge && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-xs ${m.badgeClass || "text-slate-300 border-slate-600"}`}
                  >
                    {m.badge}
                  </span>
                </div>
              )}

              {/* Citation chips */}
              {m.citations?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <div className="text-xs text-[var(--muted)] mb-1 w-full">📖 Citations:</div>
                  {m.citations.map((c, j) => (
                    <button
                      key={j}
                      onClick={() => {
                        console.log(`Citation clicked: page ${c.page}, exactText:`, c.exactText, `searchPages:`, c.searchPages);
                        onCitationClick?.({ page: c.page, quote: c.exactText, searchPages: c.searchPages });
                      }}
                      className="group rounded-full border border-[#37507a] bg-[#1a2332] px-3 py-1.5 text-xs text-[#bcd0ea] hover:bg-[#12233a] hover:border-[#4a6fa5] transition-all duration-200 hover:scale-105"
                      title={`Click to go to page ${c.page} and highlight: "${c.exactText}"`}
                      type="button"
                    >
                      <span className="italic">"{c.exactText?.slice(0, 35) || 'Citation text'}
                      {(c.exactText?.length || 0) > 35 ? "…" : ""}"</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {/* Legal preset mock badges */}
              {m.risks?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.risks.map((r, k) => (
                    <span
                      key={k}
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        r === "Auto-renewal" || r === "Arbitration"
                          ? "text-amber-300 border-amber-400/60"
                          : "text-slate-300 border-slate-600"
                      }`}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        
        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-start gap-2">
            <div className="w-16 text-right text-xs text-[var(--muted)] pt-1">AI</div>
            <div className="flex-1 rounded-2xl border border-[#1f2836] bg-[var(--panel)] p-3">
              <div className="flex items-center gap-2">
                <span>AI is thinking</span>
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div 
                      key={i} 
                      className="w-1 h-1 bg-blue-400 rounded-full animate-pulse" 
                      style={{ animationDelay: `${i * 0.2}s` }} 
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-[var(--line)] bg-[rgba(14,20,29,.9)] p-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={useCallback((e) => setInput(e.target.value), [])}
            onKeyDown={useCallback((e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }, [send])}
            placeholder={documentId ? "Ask about this document…" : "Upload a PDF to start chatting"}
            disabled={!documentId || isLoading}
            className={`flex-1 rounded-xl border px-3 py-2 ${
              documentId && !isLoading
                ? "border-slate-700 bg-[#0f1520]"
                : "border-slate-600 bg-slate-800/50 text-slate-400"
            }`}
          />
          <button
            onClick={send}
            disabled={!documentId || isLoading || !input.trim()}
            className={`rounded-xl border px-3 py-2 ${
              documentId && !isLoading && input.trim()
                ? "border-slate-700 bg-[#1b2432] hover:bg-[#1e293b]"
                : "border-slate-600 bg-slate-800/50 text-slate-400 cursor-not-allowed"
            }`}
            type="button"
          >
            {isLoading ? "..." : "Send"}
          </button>
        </div>
        <div className="mt-2 text-xs text-[var(--muted)]">
          {documentId 
            ? "Tip: Click the citation chips to jump and highlight the clause in the PDF."
            : "Upload a PDF document to enable chat functionality."
          }
        </div>
      </div>
    </div>
  );
}
