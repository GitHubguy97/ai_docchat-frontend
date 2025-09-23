import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";

// ✅ pdfjs-dist v5 uses an ESM worker: pdf.worker.min.mjs
// Vite resolves it to a static URL with ?url so the worker loads reliably.
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

const Btn = (p) => <button type="button" {...p} className={`btn-ghost ${p.className || ""}`} />;

const PdfPane = forwardRef(function PdfPane({ source, onReady = () => {}, onFailed = () => {} }, ref) {
  const scrollRef = useRef(null);
  const pageRefs = useRef(new Map());

  const [numPages, setNumPages] = useState(null);
  const [scale, setScale] = useState(1.1);
  const [fitWidth, setFitWidth] = useState(true);
  const [page, setPage] = useState(1);
  const [containerWidth, setContainerWidth] = useState(null);
  const [pageNaturalWidth, setPageNaturalWidth] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const pageTextsRef = useRef(new Map());

  // Use blob URL when uploading Files (more robust)
  const [blobUrl, setBlobUrl] = useState(null);
  useEffect(() => {
    if (!source || source.type !== "file" || !source.src) {
      setBlobUrl(null);
      return;
    }
    const url = URL.createObjectURL(source.src);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);

  // Allow local override for direct drag & drop
  const [localOverride, setLocalOverride] = useState(null);

  // Observe container width for "fit to width"
  useEffect(() => {
    if (!scrollRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setContainerWidth(e.contentRect.width);
    });
    ro.observe(scrollRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!fitWidth || !containerWidth || !pageNaturalWidth) return;
    const target = Math.max(320, containerWidth - 24);
    setScale(target / pageNaturalWidth);
  }, [fitWidth, containerWidth, pageNaturalWidth]);

  // Resolve the "file" prop for <Document />
  const fileProp = useMemo(() => {
    if (localOverride?.src) return { url: localOverride.src };
    if (!source) return null;
    if (source.type === "file") return blobUrl ? { url: blobUrl } : source.src;
    if (source.type === "url") return { url: source.src, withCredentials: false };
    return null;
  }, [source, localOverride, blobUrl]);

  const onDocumentLoadSuccess = useCallback(({ numPages: np }) => {
    setNumPages(np);
    setPage(1);
    onReady();
  }, [onReady]);
  
  const onDocumentLoadError = useCallback((err) => {
    console.error("PDF load error:", err);
    onFailed();
  }, [onFailed]);

  const onPageRender = useCallback((p) => {
    const host = pageRefs.current.get(p);
    if (!host) return;

    // Calibrate natural width for "fit" on first page
    if (p === 1) {
      const canvas = host.querySelector("canvas");
      if (canvas) {
        const rendered = canvas.getBoundingClientRect().width;
        const computed = rendered / scale;
        setPageNaturalWidth(computed > 0 ? computed : canvas.width || 794);
      }
    }

    // Collect text for highlight - with retry mechanism
    const extractText = () => {
      const tl = host.querySelector(".react-pdf__Page__textContent");
      if (tl) {
        const spans = Array.from(tl.querySelectorAll("span"));
        const text = spans.map((s) => s.textContent).join(" ");
        if (text.trim().length > 0) {
          pageTextsRef.current.set(p, text);
          console.log(`Extracted text for page ${p}:`, text.substring(0, 100) + "...");
          return true;
        }
      }
      return false;
    };

    // Try immediately
    if (!extractText()) {
      // If no text found, retry after a short delay
      setTimeout(() => {
        if (!extractText()) {
          console.log(`No text found for page ${p} after retry`);
        }
      }, 100);
    }
  }, [scale]);

  useImperativeHandle(ref, () => ({
    jumpTo: ({ page: target, quote }) => {
      const p = Math.min(Math.max(target || 1, 1), numPages || 1);
      const el = pageRefs.current.get(p);
      if (!el) {
        console.log(`Page ${p} not found`);
        return;
      }
      
      console.log(`Jumping to page ${p}${quote ? ` with quote: "${quote}"` : ''}`);
      
      // Add visual ring to indicate page
      el.classList.add("ring-2", "ring-[var(--accent)]");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => el.classList.remove("ring-2", "ring-[var(--accent)]"), 2000);
      
      // Highlight the quote if provided
      if (quote) {
        // Small delay to ensure page is rendered
        setTimeout(() => {
          const success = highlightQuote(p, quote);
          if (success) {
            console.log(`Successfully highlighted quote on page ${p}`);
          } else {
            console.log(`Failed to highlight quote on page ${p}`);
          }
        }, 300);
      }
    },
    getPageTexts: () => {
      const arr = [];
      for (let i = 1; i <= (numPages || 0); i++) {
        const text = pageTextsRef.current.get(i) || "";
        arr.push({ page: i, text });
        if (!text) {
          console.log(`Page ${i} has no extracted text`);
        }
      }
      return arr;
    },
    forceTextExtraction: () => {
      // Force re-extraction of text for all pages
      for (let i = 1; i <= (numPages || 0); i++) {
        const host = pageRefs.current.get(i);
        if (host) {
          const tl = host.querySelector(".react-pdf__Page__textContent");
          if (tl) {
            const spans = Array.from(tl.querySelectorAll("span"));
            const text = spans.map((s) => s.textContent).join(" ");
            pageTextsRef.current.set(i, text);
            console.log(`Force extracted text for page ${i}:`, text.substring(0, 100) + "...");
          }
        }
      }
    },
  }));

  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const highlightQuote = (p, quote) => {
    const host = pageRefs.current.get(p);
    if (!host) {
      console.log(`Page ${p} host element not found`);
      return false;
    }
    
    const tl = host.querySelector(".react-pdf__Page__textContent");
    if (!tl) {
      console.log(`No text layer found for page ${p}`);
      return false;
    }
    
    // Clear previous highlights
    tl.querySelectorAll("[data-hl='1']").forEach((n) => {
      n.removeAttribute("data-hl");
      n.style.background = "transparent";
    });
    
    const q = norm(quote);
    if (!q) {
      console.log(`Empty quote after normalization`);
      return false;
    }
    
    console.log(`Searching for quote on page ${p}:`, q);
    console.log(`Text layer has ${tl.children.length} children`);
    
    // Try multiple search strategies
    const spans = Array.from(tl.querySelectorAll("span"));
    console.log(`Found ${spans.length} text spans on page ${p}`);
    
    if (spans.length === 0) {
      console.log(`No text spans found on page ${p}`);
      return false;
    }
    
    // Log some sample text for debugging
    const sampleText = spans.slice(0, 3).map(s => s.textContent).join(" ");
    console.log(`Sample text from page ${p}:`, sampleText.substring(0, 100) + "...");
    
    let found = false;
    
    // Strategy 1: Look for exact match
    for (const span of spans) {
      if (norm(span.textContent).includes(q)) {
        highlightSpan(span);
        found = true;
        console.log(`Found exact match in span:`, span.textContent);
        break;
      }
    }
    
    // Strategy 2: Look for partial match with anchor
    if (!found) {
      const anchor = q.slice(Math.max(0, Math.floor(q.length / 2) - 7), Math.floor(q.length / 2) + 7);
      console.log(`Trying anchor search with:`, anchor);
      for (const span of spans) {
        if (norm(span.textContent).includes(anchor)) {
          highlightSpan(span);
          found = true;
          console.log(`Found anchor match in span:`, span.textContent);
          break;
        }
      }
    }
    
    // Strategy 3: Look for any word from the quote
    if (!found) {
      const words = q.split(' ').filter(w => w.length > 3);
      console.log(`Trying word search with:`, words);
      for (const word of words) {
        for (const span of spans) {
          if (norm(span.textContent).includes(word)) {
            highlightSpan(span);
            found = true;
            console.log(`Found word match for "${word}" in span:`, span.textContent);
            break;
          }
        }
        if (found) break;
      }
    }
    
    if (found) {
      console.log(`Successfully highlighted quote on page ${p}`);
    } else {
      console.log(`Could not find quote on page ${p}. Available text:`, spans.map(s => s.textContent).join(" ").substring(0, 200) + "...");
    }
    
    return found;
  };
  
  const highlightSpan = (span) => {
    [span.previousElementSibling, span, span.nextElementSibling]
      .filter(Boolean)
      .forEach((s) => {
        s.setAttribute("data-hl", "1");
        s.style.background = "rgba(255,235,59,.35)";
        s.style.borderRadius = "3px";
        s.style.padding = "2px";
      });
  };

  const zoomOut = useCallback(() => { 
    setFitWidth(false); 
    setScale((s) => Math.max(0.5, Math.round((s - 0.1) * 10) / 10)); 
  }, []);
  
  const zoomIn = useCallback(() => { 
    setFitWidth(false); 
    setScale((s) => Math.min(3, Math.round((s + 0.1) * 10) / 10)); 
  }, []);
  
  const zoomFit = useCallback(() => setFitWidth(true), []);

  const prev = useCallback(() => {
    const p = Math.max(1, page - 1);
    setPage(p);
    pageRefs.current.get(p)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [page]);
  
  const next = useCallback(() => {
    const p = Math.min(numPages || 1, page + 1);
    setPage(p);
    pageRefs.current.get(p)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [page, numPages]);

  // Sync current page while scrolling
  const onScroll = useCallback(() => {
    let best = { p: 1, d: Infinity };
    pageRefs.current.forEach((el, num) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - window.innerHeight / 2);
      if (d < best.d) best = { p: num, d };
    });
    setPage(best.p);
  }, []);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    
    scroller.addEventListener("scroll", onScroll);
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  // Drag & drop handlers
  const stop = useCallback((e) => { e.preventDefault(); e.stopPropagation(); }, []);
  const over = useCallback((e) => { stop(e); setDragOver(true); }, [stop]);
  const leave = useCallback((e) => { stop(e); setDragOver(false); }, [stop]);
  const drop = useCallback((e) => {
    stop(e);
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f && (f.type === "application/pdf" || /\.pdf$/i.test(f.name))) {
      const url = URL.createObjectURL(f);
      setLocalOverride({ src: url });
    }
  }, [stop]);

  // Drag & drop viewer (creates blob URL)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    
    el.addEventListener("dragenter", over);
    el.addEventListener("dragover", over);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragenter", over);
      el.removeEventListener("dragover", over);
      el.removeEventListener("dragleave", leave);
      el.removeEventListener("drop", drop);
    };
  }, [over, leave, drop]);

  // Memoized options to avoid noisy warnings
  const docOptions = useMemo(() => ({ isEvalSupported: false }), []);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--line)] bg-[#0c121a]/90 px-3 py-2 backdrop-blur">
        <Btn onClick={prev} title="Previous page">◀</Btn>
        <div className="text-xs text-[var(--muted)]">Page {page} / {numPages ?? "—"}</div>
        <Btn onClick={next} title="Next page">▶</Btn>
        <div className="mx-2 h-5 w-px bg-[var(--line)]" />
        <Btn onClick={zoomOut} title="Zoom out">−</Btn>
        <Btn onClick={zoomFit} title="Fit width">Fit</Btn>
        <Btn onClick={zoomIn} title="Zoom in">＋</Btn>
        <div className="ml-auto text-xs text-[var(--muted)]">
          {fitWidth ? "Fit to width" : `${Math.round(scale * 100)}%`}
        </div>
      </div>

      {/* Viewer */}
      <div ref={scrollRef} className="relative h-full min-h-0 overflow-auto">
        {!fileProp ? (
          <div className="p-6 text-[var(--muted)]">
            Drag & drop a PDF here, or use the Upload/URL controls above.
          </div>
        ) : (
          <Document
            file={fileProp}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            className="px-3 pb-14"
            loading={<div className="p-4 text-[var(--muted)]">Loading PDF…</div>}
            error={<div className="p-4 text-red-300">Failed to load PDF.</div>}
            options={docOptions}
          >
            {Array.from(new Array(numPages), (_, i) => i + 1).map((p) => (
              <div
                key={p}
                ref={(el) => el && pageRefs.current.set(p, el)}
                className="mx-auto my-3 w-[min(96%,900px)] overflow-hidden rounded-xl border border-[#162133] bg-[#0e151f] shadow-lg"
              >
                <Page
                  pageNumber={p}
                  scale={scale}
                  renderTextLayer
                  renderAnnotationLayer
                  onRenderSuccess={() => onPageRender(p)}
                />
              </div>
            ))}
          </Document>
        )}

        {/* Drop overlay */}
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="rounded-xl border border-[var(--accent)]/50 bg-[#0b0f14]/70 px-4 py-3 text-sm text-[var(--accent)]">
              Drop PDF to view
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default PdfPane;
