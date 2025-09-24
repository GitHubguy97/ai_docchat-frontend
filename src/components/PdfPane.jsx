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
import { getDocument } from "pdfjs-dist";

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
    jumpTo: ({ page: target, quote, searchPages }) => {
      console.log(`🔍 Citation search requested:`, { quote: quote?.substring(0, 50) + "..." });
      
      // If no quote, just jump to page 1
      if (!quote) {
        const el = pageRefs.current.get(1);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }

      console.log(`📄 Searching entire PDF for quote...`);
      
      // Search all pages for the quote (ignore page numbers - they're wrong)
      let foundPage = null;
      for (let pageNum = 1; pageNum <= (numPages || 1); pageNum++) {
        const el = pageRefs.current.get(pageNum);
        
        if (!el) {
          continue;
        }
        
        console.log(`🔍 Searching page ${pageNum}...`);
        
        // Try to highlight the quote on this page
        const success = highlightQuote(pageNum, quote);
        if (success) {
          foundPage = pageNum;
          console.log(`✅ Found and highlighted quote on page ${pageNum} - stopping search`);
          
          // Jump to the successful page with a small delay to ensure highlighting is visible
          setTimeout(() => {
            el.classList.add("ring-2", "ring-[var(--accent)]");
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            setTimeout(() => el.classList.remove("ring-2", "ring-[var(--accent)]"), 3000);
          }, 100);
          break;
        }
      }
      
      if (!foundPage) {
        console.log(`⚠️ Quote not found on any page`);
        // Still jump to page 1 as fallback
        const el = pageRefs.current.get(1);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
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
    
    console.log(`🔍 PDF text search on page ${p}:`, quote.substring(0, 50) + "...");

    // Get the text layer element
    const textLayer = host.querySelector(".react-pdf__Page__textContent");
    if (!textLayer) {
      console.log(`No text layer found for page ${p}`);
      return false;
    }

    // Clear any existing highlights
    textLayer.querySelectorAll('[data-pdf-highlight]').forEach(el => {
      el.style.backgroundColor = '';
      el.removeAttribute('data-pdf-highlight');
    });

    // Get all text spans
    const spans = Array.from(textLayer.querySelectorAll('span'));
    if (spans.length === 0) {
      console.log(`No text spans found on page ${p}`);
      return false;
    }

    console.log(`Found ${spans.length} text spans on page ${p}`);

    // Normalize text for searching
    const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, ' ').trim();
    
    // Create a map of normalized text to original spans
    const spanMap = spans.map(span => ({
      element: span,
      text: span.textContent,
      normalized: normalizeText(span.textContent)
    }));

    // Get the full page text
    const fullPageText = spanMap.map(s => s.normalized).join(' ');
    const searchQuery = normalizeText(quote);

    console.log(`Page text sample:`, fullPageText.substring(0, 100) + "...");
    console.log(`Searching for:`, searchQuery);

    // Try to find the quote in the page text
    if (!fullPageText.includes(searchQuery.substring(0, Math.min(15, searchQuery.length)))) {
      console.log(`❌ Quote not found on page ${p}`);
      return false;
    }

    // Simple approach: Just find the exact text or 75% of it
    const combinedText = spanMap.map(s => s.text).join(' ');
    const combinedNormalized = normalizeText(combinedText);
    
    console.log(`🔍 Looking for quote in combined text...`);

    let highlightedSpans = 0;
    let matchedText = '';
    let found = false;

    // Try different lengths: 100%, 75%, 50% of the quote
    const searchLengths = [1.0, 0.75, 0.5];
    
    for (const ratio of searchLengths) {
      const searchLength = Math.floor(searchQuery.length * ratio);
      const searchText = searchQuery.substring(0, searchLength);
      
      console.log(`🔎 Trying ${Math.round(ratio * 100)}% of quote (${searchLength} chars): "${searchText}"`);
      
      const matchIndex = combinedNormalized.indexOf(searchText);
      
      if (matchIndex !== -1) {
        console.log(`✅ Found match at position ${matchIndex}!`);
        
        // Find which spans contain this match
        let currentPos = 0;
        const matchEnd = matchIndex + searchText.length;
        
        for (let i = 0; i < spanMap.length; i++) {
          const span = spanMap[i];
          const spanStart = currentPos;
          const spanEnd = currentPos + span.normalized.length + 1; // +1 for space
          
          // Check if this span overlaps with our match
          if (spanStart < matchEnd && spanEnd > matchIndex) {
            span.element.style.backgroundColor = 'rgba(255, 235, 59, 0.8)';
            span.element.style.borderRadius = '3px';
            span.element.style.padding = '2px 3px';
            span.element.style.border = '1px solid rgba(255, 193, 7, 0.6)';
            span.element.setAttribute('data-pdf-highlight', 'true');
            
            highlightedSpans++;
            matchedText += span.text + ' ';
            console.log(`✅ Highlighted span ${i}:`, span.text.substring(0, 50) + "...");
          }
          
          currentPos = spanEnd;
        }
        
        found = true;
        break; // Stop after first successful match
      }
    }
    
    if (!found) {
      console.log(`❌ No match found for any length of the quote`);
    }

    if (highlightedSpans > 0) {
      console.log(`✅ Successfully highlighted ${highlightedSpans} spans on page ${p}`);
      console.log(`Matched text:`, matchedText.substring(0, 100) + "...");
      return true;
    } else {
      console.log(`❌ Could not highlight quote on page ${p}`);
      return false;
    }
  };
  
  const highlightSpan = (span) => {
    console.log(`🎨 Highlighting span:`, span.textContent);
    [span.previousElementSibling, span, span.nextElementSibling]
      .filter(Boolean)
      .forEach((s) => {
        s.setAttribute("data-hl", "1");
        // Use more visible highlighting
        s.style.backgroundColor = "rgba(255, 235, 59, 0.7)"; // More opaque yellow
        s.style.borderRadius = "4px";
        s.style.padding = "3px 2px";
        s.style.border = "1px solid rgba(255, 193, 7, 0.8)"; // Yellow border
        s.style.boxShadow = "0 0 3px rgba(255, 235, 59, 0.5)"; // Glow effect
        console.log(`✅ Applied highlighting to:`, s.textContent?.substring(0, 30) + "...");
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
