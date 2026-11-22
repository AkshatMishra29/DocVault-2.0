import React from 'react';
import {
  Eye,
  Download,
  Share2,
  Lock,
  Globe,
  Users,
  ShieldCheck,
  Calendar,
  HardDrive,
  ExternalLink,
} from 'lucide-react';
import DocumentTypeIcon from '../DocumentTypeIcon/DocumentTypeIcon';
import './DocumentCard.css';

export default function DocumentCard({
  document,
  isOwner = true,
  permissions = { view: true, download: false },
  onOpen,
  onPreview,
  onShare,
  onDownload,
  showActions = true,
  badgeText = null,
  privacyMode = 'NORMAL',
  className = '',
}) {
  const doc = document || {};
  const docId = doc._id || doc.documentId;
  const title = doc.title || doc.originalName || 'Untitled Document';
  const category = doc.category || 'General';
  const format = (doc.format || 'PDF').toUpperCase();
  const fileSize = doc.fileSizeFormatted || (doc.fileSize ? `${Math.round(doc.fileSize / 1024)} KB` : null);
  const dateStr = doc.createdAt || doc.uploadDate || doc.sharedAt;
  const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  const canDownload = isOwner || permissions?.download === true;

  // Determine privacy status badge
  let statusBadge = null;
  if (badgeText) {
    statusBadge = <span className="dv-card-badge dv-card-badge--custom">{badgeText}</span>;
  } else if (doc.isPrivate || (!isOwner ? false : doc.shareCount === 0 || doc.privacyStatus === 'PRIVATE')) {
    statusBadge = (
      <span className="dv-card-badge dv-card-badge--private" title="Private document: only you have access">
        <Lock size={11} />
        <span>Private</span>
      </span>
    );
  } else if (!isOwner) {
    statusBadge = (
      <span className="dv-card-badge dv-card-badge--shared-in" title="Shared with you">
        <Users size={11} />
        <span>{permissions?.download ? 'View + Download' : 'View Only'}</span>
      </span>
    );
  } else if (doc.shareCount > 0) {
    statusBadge = (
      <span className="dv-card-badge dv-card-badge--shared-out" title={`Shared with ${doc.shareCount} connection(s)`}>
        <Share2 size={11} />
        <span>Shared ({doc.shareCount})</span>
      </span>
    );
  }

  return (
    <div
      className={`dv-doc-card-component ${className}`}
      onClick={() => onOpen && onOpen(doc)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen && onOpen(doc);
        }
      }}
    >
      {/* Top Header: Icon + Badges */}
      <div className="dv-doc-card-component__header">
        <DocumentTypeIcon
          category={category}
          format={format}
          isStorageOnly={privacyMode === 'STORAGE_ONLY' || doc.privacyMode === 'STORAGE_ONLY'}
          size={20}
        />
        <div className="dv-doc-card-component__header-badges">
          <span className="dv-card-format-pill">{format}</span>
          {statusBadge}
        </div>
      </div>

      {/* Body: Title + Metadata */}
      <div className="dv-doc-card-component__body">
        <h4 className="dv-doc-card-component__title" title={title}>
          {title}
        </h4>
        <div className="dv-doc-card-component__category-row">
          <span className="dv-doc-card-component__category">{category}</span>
          {doc.owner && (
            <span className="dv-doc-card-component__owner" title={doc.owner.docVaultId ? `Owner ID: ${doc.owner.docVaultId}` : ''}>
              by {doc.owner.name}
            </span>
          )}
        </div>
        {doc.summary && (
          <p className="dv-doc-card-component__summary" title={doc.summary}>
            {doc.summary}
          </p>
        )}
      </div>

      {/* Meta Specs: File Size + Date */}
      <div className="dv-doc-card-component__specs">
        {fileSize && (
          <span className="dv-doc-card-component__spec-item" title="File Size">
            <HardDrive size={12} />
            <span>{fileSize}</span>
          </span>
        )}
        {formattedDate && (
          <span className="dv-doc-card-component__spec-item" title="Date Added/Shared">
            <Calendar size={12} />
            <span>{formattedDate}</span>
          </span>
        )}
      </div>

      {/* Footer Actions */}
      {showActions && (
        <div className="dv-doc-card-component__footer" onClick={(e) => e.stopPropagation()}>
          <div className="dv-doc-card-component__actions-left">
            {onPreview && (
              <button
                type="button"
                className="dv-card-btn dv-card-btn--preview"
                onClick={(e) => {
                  e.stopPropagation();
                  onPreview(doc);
                }}
                title="Preview document content"
              >
                <Eye size={13} />
                <span>Preview</span>
              </button>
            )}
            {canDownload && onDownload && (
              <button
                type="button"
                className="dv-card-btn dv-card-btn--download"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload(doc);
                }}
                title="Download file copy"
              >
                <Download size={13} />
                <span>Download</span>
              </button>
            )}
          </div>

          <div className="dv-doc-card-component__actions-right">
            {isOwner && onShare && (
              <button
                type="button"
                className="dv-card-icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onShare(doc);
                }}
                title="Share document directly"
              >
                <Share2 size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
