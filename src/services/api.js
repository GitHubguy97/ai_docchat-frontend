// API service for backend communication

const API_BASE_URL = 'http://localhost:8000';

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
        throw error;
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Document upload
  async uploadDocument(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${this.baseURL}/ingest`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Upload failed: ${response.statusText}`);
    }

    return await response.json();
  }

  // URL ingestion
  async ingestUrl(url) {
    const formData = new FormData();
    formData.append('url', url);
    
    const response = await fetch(`${this.baseURL}/ingest`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `URL ingestion failed: ${response.statusText}`);
    }

    return await response.json();
  }

  // Ask question
  async askQuestion(question, documentId) {
    return this.request('/ask', {
      method: 'POST',
      body: JSON.stringify({
        question,
        document_id: documentId,
      }),
    });
  }

  // Get job status
  async getJobStatus(jobId) {
    return this.request(`/jobs/${jobId}`);
  }

  // Health check
  async healthCheck() {
    return this.request('/health');
  }
}

export default new ApiService();
