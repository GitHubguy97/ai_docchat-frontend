import React from 'react';

export default function ProgressBar({ progress, status, message, className = "" }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'ready': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
      case 'processing': return 'bg-blue-500';
      case 'queued': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'ready': return 'Ready';
      case 'failed': return 'Failed';
      case 'processing': return 'Processing';
      case 'queued': return 'Queued';
      case 'uploading': return 'Uploading';
      default: return 'Unknown';
    }
  };

  return (
    <div className={`w-full ${className}`}>
      {/* Progress bar */}
      <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
        <div 
          className={`h-2 rounded-full transition-all duration-500 ${getStatusColor(status)}`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      
      {/* Status and message */}
      <div className="flex items-center justify-between text-xs">
        <span className={`font-medium ${
          status === 'ready' ? 'text-green-400' : 
          status === 'failed' ? 'text-red-400' : 
          status === 'processing' ? 'text-blue-400' : 
          'text-yellow-400'
        }`}>
          {getStatusText(status)}
        </span>
        <span className="text-gray-400">
          {Math.round(progress)}%
        </span>
      </div>
      
      {/* Message */}
      {message && (
        <div className="mt-1 text-xs text-gray-300 truncate">
          {message}
        </div>
      )}
    </div>
  );
}
