import React, { useCallback, useRef, useState } from "react";
import PdfPane from "./components/PdfPane.jsx";
import ChatPane from "./components/ChatPane.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import ProgressBar from "./components/ProgressBar.jsx";
import { useDocumentProcessing } from "./hooks/useDocumentProcessing.js";
import { useChat } from "./hooks/useChat.js";

export default function App() {
  const pdfRef = useRef(null);
  const [pdfSource, setPdfSource] = useState(null);
  const [pageTexts, setPageTexts] = useState([]);
  const urlRef = useRef();
  
  // Use custom hooks
  const { document, progress, status, message, uploadDocument, resetDocument } = useDocumentProcessing();
  const { messages, isLoading, error, sendQuestion, clearChat } = useChat(document?.id);

  const onUpload = useCallback(async (file) => {
    if (!file) return;
    
    try {
      // Reset previous document
      resetDocument();
      clearChat();
      
      // Set PDF source for display
      setPdfSource({ type: "file", src: file });
      
      // Upload to backend
      await uploadDocument(file);
      
    } catch (error) {
      console.error('Upload error:', error);
      // Error handling is done in the hook
    }
  }, [uploadDocument, resetDocument, clearChat]);
  
  const onIngestUrl = useCallback((url) => {
    if (!url) return;
    // For now, just set PDF source for display
    // TODO: Implement URL ingestion in backend
    setPdfSource({ type: "url", src: url });
  }, []);

  const handlePdfReady = useCallback(() => {
    // Extract page texts after PDF is ready - with multiple attempts
    const extractTexts = (attempt = 1) => {
      const texts = pdfRef.current?.getPageTexts?.() || [];
      const validTexts = texts.filter(t => t.text && t.text.trim().length > 0);
      
      if (validTexts.length > 0) {
        setPageTexts(validTexts);
        console.log("Extracted page texts:", validTexts);
      } else if (attempt < 5) {
        // Retry up to 5 times with increasing delays
        setTimeout(() => extractTexts(attempt + 1), attempt * 500);
        console.log(`Attempt ${attempt}: No text found, retrying...`);
      } else {
        console.log("Failed to extract text after 5 attempts");
        setPageTexts([]);
      }
    };
    
    // Start extraction after initial delay
    setTimeout(() => extractTexts(), 1000);
  }, []);
  
  const handlePdfFailed = useCallback(() => {
    // PDF failed to load - this is handled by the document processing hook
    console.log("PDF failed to load");
  }, []);

  const jumpToCitation = useCallback(({ page, quote }) => pdfRef.current?.jumpTo?.({ page, quote }), []);
  
  // Function to refresh page texts (useful for debugging)
  const refreshPageTexts = useCallback(() => {
    // Force re-extraction of text
    pdfRef.current?.forceTextExtraction?.();
    const texts = pdfRef.current?.getPageTexts?.() || [];
    const validTexts = texts.filter(t => t.text && t.text.trim().length > 0);
    setPageTexts(validTexts);
    console.log("Force refreshed page texts:", validTexts);
  }, []);

  return (
    <ErrorBoundary>
      {/* ⬇️ Full-viewport, no extra scrollbars */}
      <div className="h-screen overflow-hidden flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[rgba(11,15,20,.85)] backdrop-blur border-b border-[var(--line)]">
        <div className="mx-auto max-w-screen-2xl px-4">
          {/* Main header row */}
          <div className="h-14 flex items-center gap-3">
            {/* Left: Title */}
            <div className="font-semibold flex-shrink-0">
              AI Document Chat
            </div>

            {/* Center: Upload controls */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <label className="btn flex-shrink-0 hidden sm:block">
                <input
                  type="file"
                  accept="application/pdf"
                  hidden
                  onChange={(e) => onUpload(e.target.files?.[0])}
                />
                Upload PDF
              </label>

              <div className="flex items-center gap-2 flex-1 min-w-0">
                <input 
                  ref={urlRef} 
                  className="input flex-1 min-w-0" 
                  placeholder="Paste URL (PDF)…" 
                />
                <button className="btn flex-shrink-0" onClick={() => onIngestUrl(urlRef.current?.value.trim())}>
                  Ingest
                </button>
              </div>
            </div>

            {/* Right: Document status and controls */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Document info - only show if document is loaded */}
              {document && (
                <div className="flex items-center gap-1 lg:gap-2">
                  <span className="pill max-w-[150px] lg:max-w-[200px] truncate" title={document.title}>
                    {document.title}
                  </span>
                  {pageTexts.length > 0 && (
                    <span className="pill text-green-300 hidden sm:block">
                      {pageTexts.length} pages
                    </span>
                  )}
                </div>
              )}
              
              {/* Progress bar - show when processing */}
              {document && (status === 'uploading' || status === 'queued' || status === 'processing') && (
                <div className="w-48">
                  <ProgressBar 
                    progress={progress} 
                    status={status} 
                    message={message}
                    className="text-xs"
                  />
                </div>
              )}

              {/* Controls */}
              <div className="flex items-center gap-1 lg:gap-2">
                {/* Mobile upload button */}
                <label className="btn text-xs px-2 py-1 sm:hidden">
                  <input
                    type="file"
                    accept="application/pdf"
                    hidden
                    onChange={(e) => onUpload(e.target.files?.[0])}
                  />
                  📄
                </label>
                
                {pdfSource && (
                  <button 
                    onClick={refreshPageTexts}
                    className="btn text-xs px-2 py-1"
                    title="Refresh page texts"
                  >
                    🔄
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Body grid fills remaining viewport */}
      <main className="flex-1 overflow-hidden">
        <div className="mx-auto max-w-screen-2xl h-full grid grid-cols-12">
          {/* Left: PDF */}
          <section className="col-span-7 border-r border-[var(--line)] overflow-hidden bg-[#0c121a] min-h-0">
            <PdfPane
              ref={pdfRef}
              source={pdfSource}
              onReady={handlePdfReady}
              onFailed={handlePdfFailed}
            />
          </section>

          {/* Right: Chat */}
          <section className="col-span-5 overflow-hidden bg-[var(--surface)] min-h-0">
            <ChatPane
              onCitationClick={jumpToCitation}
              pageTexts={pageTexts}
              messages={messages}
              isLoading={isLoading}
              error={error}
              onSendQuestion={sendQuestion}
              documentId={document?.id}
            />
          </section>
        </div>
      </main>
    </div>
    </ErrorBoundary>
  );
}
