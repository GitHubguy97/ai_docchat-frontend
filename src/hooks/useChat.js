import { useState, useCallback } from 'react';
import apiService from '../services/api';

export const useChat = (documentId) => {
  const [messages, setMessages] = useState([
    {
      who: "System",
      text: "Upload a PDF on the left, then ask a question here. Citations will be clickable.",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Add message helper
  const addMessage = useCallback((message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  // Send question to backend
  const sendQuestion = useCallback(async (question) => {
    if (!question.trim() || !documentId) return;
    
    // Add user message
    addMessage({ who: "You", text: question });
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiService.askQuestion(question, documentId);
      
      // Add AI response with citations
      addMessage({
        who: "Answer",
        text: response.answer,
        citations: response.citations.map(citation => ({
          page: citation.page_start,
          exactText: citation.exact_text,
          searchPages: citation.search_pages,
          text: citation.text,
          chunkId: citation.chunk_id
        })),
        totalChunks: response.total_chunks_found
      });
      
    } catch (error) {
      setError(error.message);
      
      addMessage({
        who: "Error",
        text: `Failed to get answer: ${error.message}`,
        isError: true
      });
    } finally {
      setIsLoading(false);
    }
  }, [documentId, addMessage]);

  // Clear chat
  const clearChat = useCallback(() => {
    setMessages([
      {
        who: "System",
        text: "Upload a PDF on the left, then ask a question here. Citations will be clickable.",
      },
    ]);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendQuestion,
    clearChat,
    addMessage
  };
};
