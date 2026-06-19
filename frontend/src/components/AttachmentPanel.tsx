import { useRef, useState } from 'react';
import { api } from '../api';

const BASE = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3000/api/v1';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime === 'application/pdf') return '📄';
  if (mime.includes('excel') || mime.includes('spreadsheet')) return '📊';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime === 'application/zip') return '🗜️';
  if (mime.startsWith('video/')) return '🎬';
  return '📎';
}

const PREVIEWABLE = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']);

interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

interface Props {
  ticketId: string;
  attachments: Attachment[];
  onRefresh: () => void;
  canDelete?: boolean;
}

export default function AttachmentPanel({ ticketId, attachments, onRefresh, canDelete = true }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [preview, setPreview] = useState<Attachment | null>(null);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadErr('');
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        await api.post(`/tickets/${ticketId}/attachments`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      onRefresh();
    } catch (e: any) {
      setUploadErr(e.response?.data?.error?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this attachment?')) return;
    try {
      await api.delete(`/attachments/${id}`);
      onRefresh();
    } catch { /* ignore */ }
  }

  function downloadUrl(id: string) {
    return `${BASE}/attachments/${id}`;
  }

  function previewUrl(id: string) {
    return `${BASE}/attachments/${id}/preview`;
  }

  return (
    <div className="attachment-panel">
      <div className="attachment-header">
        <span className="card-title" style={{ fontSize: 13 }}>
          Attachments {attachments.length > 0 && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({attachments.length})</span>}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-xs"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Uploading…</> : '+ Upload'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          accept="image/*,.pdf,.xls,.xlsx,.doc,.docx,.csv,.txt,.zip,.mp4,.mov,.avi,.log"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {uploadErr && <div className="alert alert-error" style={{ margin: '8px 0 0', fontSize: 12 }}>{uploadErr}</div>}

      {attachments.length === 0 ? (
        <div
          className="attachment-dropzone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
        >
          <span style={{ fontSize: 22 }}>📎</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Drop files or click to upload</span>
        </div>
      ) : (
        <div className="attachment-list">
          {attachments.map((a) => (
            <div key={a.id} className="attachment-item">
              <span style={{ fontSize: 18, flexShrink: 0 }}>{fileIcon(a.mimeType)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.fileName}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatBytes(a.sizeBytes)}</div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {PREVIEWABLE.has(a.mimeType) && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    title="Preview"
                    onClick={() => setPreview(a)}
                  >👁</button>
                )}
                <a
                  href={downloadUrl(a.id)}
                  className="btn btn-ghost btn-xs"
                  title="Download"
                  download={a.fileName}
                  target="_blank"
                  rel="noopener noreferrer"
                >⬇</a>
                {canDelete && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    title="Delete"
                    style={{ color: '#dc2626' }}
                    onClick={() => handleDelete(a.id)}
                  >🗑</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div className="preview-overlay" onClick={() => setPreview(null)}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <span style={{ fontSize: 13, fontWeight: 500 }}>{preview.fileName}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <a
                  href={downloadUrl(preview.id)}
                  className="btn btn-secondary btn-xs"
                  download={preview.fileName}
                  target="_blank"
                  rel="noopener noreferrer"
                >Download</a>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setPreview(null)}>✕</button>
              </div>
            </div>
            <div className="preview-modal-body">
              {preview.mimeType.startsWith('image/') ? (
                <img src={previewUrl(preview.id)} alt={preview.fileName} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
              ) : preview.mimeType === 'application/pdf' ? (
                <iframe src={previewUrl(preview.id)} style={{ width: '100%', height: '70vh', border: 'none' }} title={preview.fileName} />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
