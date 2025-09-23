import { useState, useEffect, useCallback } from 'react';
import apiService from '../services/api';

export const useDocumentProcessing = () => {
  const [document, setDocument] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle'); // idle, uploading, processing, ready, failed
  const [message, setMessage] = useState('');

  // Smart progress bar with status-based jumps
  const updateProgress = useCallback((newStatus, newProgress = null) => {
    setStatus(newStatus);
    
    if (newProgress !== null) {
      setProgress(newProgress);
    } else {
      // Status-based progress mapping
      const progressMap = {
        'uploading': 10,
        'queued': 20,
        'processing': 50,
        'ready': 100,
        'failed': 0
      };
      setProgress(progressMap[newStatus] || 0);
    }
  }, []);

  // Upload document
  const uploadDocument = useCallback(async (file) => {
    try {
      updateProgress('uploading', 10);
      setMessage('Uploading document...');
      
      const result = await apiService.uploadDocument(file);
      
      setDocument({
        id: result.document_id,
        title: file.name,
        status: 'queued'
      });
      
      updateProgress('queued', 20);
      setMessage('Document queued for processing...');
      
      // Start polling for job status
      startJobPolling(result.document_id);
      
      return result;
    } catch (error) {
      updateProgress('failed', 0);
      setMessage(`Upload failed: ${error.message}`);
      throw error;
    }
  }, [updateProgress]);

  // Poll job status
  const startJobPolling = useCallback((jobId) => {
    const pollInterval = setInterval(async () => {
      try {
        const jobStatus = await apiService.getJobStatus(jobId);
        
        setDocument(prev => ({
          ...prev,
          status: jobStatus.status,
          title: jobStatus.title || prev?.title
        }));
        
        setProgress(jobStatus.progress);
        setMessage(jobStatus.message || `Status: ${jobStatus.status}`);
        
        // Stop polling when job is complete or failed
        if (jobStatus.status === 'ready' || jobStatus.status === 'failed') {
          clearInterval(pollInterval);
          updateProgress(jobStatus.status, jobStatus.progress);
        }
      } catch (error) {
        // Continue polling on error
      }
    }, 2000); // Poll every 2 seconds

    // Cleanup after 5 minutes to prevent infinite polling
    setTimeout(() => {
      clearInterval(pollInterval);
    }, 300000);
  }, [updateProgress]);

  // Reset document state
  const resetDocument = useCallback(() => {
    setDocument(null);
    setProgress(0);
    setStatus('idle');
    setMessage('');
  }, []);

  return {
    document,
    progress,
    status,
    message,
    uploadDocument,
    resetDocument,
    updateProgress
  };
};
