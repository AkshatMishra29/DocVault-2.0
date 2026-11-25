import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  FileCheck,
  Eye,
  ExternalLink,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Layers,
  Zap,
  Pencil,
  Trash2,
  Sparkles,
  Check,
  X,
  Loader2,
} from "lucide-react";
import Modal from "../../../components/common/Modal/Modal";
import Badge from "../../../components/common/Badge/Badge";
import { API_BASE_URL } from "../../../services/api/apiClient";

export default function SourceChips({
  sources = [],
  onCreateFlashcard,
  onDocumentUpdated,
  onDocumentDeleted,
}) {
  const navigate = useNavigate();
  const [activeDoc, setActiveDoc] = useState(null);
  const [viewerScale, setViewerScale] = useState(1);
  const [viewerRotation, setViewerRotation] = useState(0);

  // Inline Edit & Delete State per document card
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [deletedIds, setDeletedIds] = useState(new Set());
  const [updatedDocs, setUpdatedDocs] = useState({});

  if (!sources || sources.length === 0) return null;

  const visibleSources = sources.filter((s) => {
    const id = s.documentId || s.assetId || s.id || s._id;
    return !deletedIds.has(id);
  });

  if (visibleSources.length === 0) return null;

  const handleOpenDocViewer = (source) => {
    setViewerScale(1);
    setViewerRotation(0);
    setActiveDoc(source);
  };

  const handleCloseDocViewer = () => {
    setActiveDoc(null);
  };

  const handleZoomIn = () => setViewerScale((s) => Math.min(s + 0.25, 2.5));
  const handleZoomOut = () => setViewerScale((s) => Math.max(s - 0.25, 0.5));
  const handleResetZoom = () => {
    setViewerScale(1);
    setViewerRotation(0);
  };
  const handleRotate = () => setViewerRotation((r) => (r + 90) % 360);

  const token =
    localStorage.getItem("docvault_token") ||
    localStorage.getItem("token") ||
    "";

  const startEdit = (source, docId) => {
    const override = updatedDocs[docId];
    setEditingId(docId);
    setDeletingId(null);
    setEditTitle(override?.title || source.title || "");
    setEditCategory(override?.category || source.category || "Document");
  };

  const saveEdit = async (docId) => {
    if (!editTitle.trim()) return;
    setBusyId(docId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/${docId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: editTitle.trim(),
          category: editCategory.trim() || "Document",
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUpdatedDocs((prev) => ({
          ...prev,
          [docId]: { title: editTitle.trim(), category: editCategory.trim() },
        }));
        setEditingId(null);
        if (onDocumentUpdated) onDocumentUpdated(docId, data.data);
      }
    } catch (err) {
      console.error("[Copilot Source Edit Error]", err);
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async (docId, docTitle, isAsset = false) => {
    setBusyId(docId);
    try {
      const endpoint = isAsset ? `/api/assets/${docId}` : `/api/documents/${docId}`;
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDeletedIds((prev) => new Set([...prev, docId]));
        setDeletingId(null);
        if (onDocumentDeleted) onDocumentDeleted(docId, docTitle);
      }
    } catch (err) {
      console.error("[Copilot Source Delete Error]", err);
    } finally {
      setBusyId(null);
    }
  };

  const docId = activeDoc
    ? activeDoc.documentId || activeDoc.assetId || activeDoc.id || activeDoc._id
    : null;

  const previewUrl = docId
    ? `${API_BASE_URL}/api/documents/${docId}/preview?token=${encodeURIComponent(token)}`
    : "";

  const downloadUrl = docId
    ? `${API_BASE_URL}/api/documents/${docId}/download?token=${encodeURIComponent(token)}`
    : "";

  return (
    <>
      <div className="dv-chat-sources-block dv-anim-fade-in">
        <div className="dv-sources-header">
          <FileCheck size={13} className="dv-sources-icon" />
          <span className="dv-sources-title">Verified Sources & Documents</span>
        </div>
        <div className="dv-sources-grid">
          {visibleSources.map((source, sIdx) => {
            const isAsset =
              source.type === "asset" || source.documentType === "flashcard";
            const currentDocId =
              source.documentId || source.assetId || source.id || source._id;

            const override = updatedDocs[currentDocId];
            const currentTitle = override?.title || source.title;
            const rawCategory = override?.category || source.category || "Document";

            const isElectricity = /electric|power|bill|utility/i.test(
              currentTitle || ""
            );
            const isResume = /resume|cv/i.test(currentTitle || "");
            const displayCategory = isResume
              ? "Resume / CV"
              : isElectricity && rawCategory === "Document"
              ? "Electricity Bill"
              : rawCategory;

            const isEditing = editingId === currentDocId;
            const isDeleting = deletingId === currentDocId;
            const isBusy = busyId === currentDocId;

            return (
              <div
                key={`${currentDocId}-${sIdx}`}
                className={`dv-source-card-wrap ${
                  isAsset ? "dv-source-card--asset" : ""
                }`}
              >
                <div className="dv-source-card">
                  <div className="dv-source-card__left">
                    <div className="dv-source-card__icon">
                      {isElectricity ? (
                        <Zap size={15} style={{ color: "#EAB308" }} />
                      ) : isAsset ? (
                        <Layers
                          size={15}
                          style={{ color: "var(--dv-accent, #356AE6)" }}
                        />
                      ) : (
                        <FileText size={15} />
                      )}
                    </div>
                    <div className="dv-source-card__meta">
                      <div
                        className="dv-source-card__title"
                        title={currentTitle}
                      >
                        {currentTitle}
                      </div>
                      <div className="dv-source-card__sub">
                        <span className="dv-source-card__badge">
                          {displayCategory}
                        </span>
                        {source.pageNumber || source.page ? (
                          <span className="dv-source-card__page">
                            {" "}
                            • Page {source.pageNumber || source.page}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="dv-source-card__actions">
                    <button
                      type="button"
                      onClick={() => {
                        if (isAsset) {
                          navigate(source.previewRoute || `/assets/${currentDocId}`);
                        } else {
                          handleOpenDocViewer({
                            ...source,
                            title: currentTitle,
                            category: displayCategory,
                            documentId: currentDocId,
                          });
                        }
                      }}
                      className="dv-source-btn dv-source-btn--preview"
                      title={isAsset ? "Open Flashcard Details" : "Quick Preview inside Chat"}
                    >
                      <Eye size={12} />
                      <span>{isAsset ? "Open Card" : "Preview"}</span>
                    </button>

                    {!isAsset && onCreateFlashcard && (
                      <button
                        type="button"
                        onClick={() =>
                          onCreateFlashcard({
                            ...source,
                            title: currentTitle,
                            category: displayCategory,
                            documentId: currentDocId,
                          })
                        }
                        className="dv-source-btn dv-source-btn--flash"
                        title="Create Flashcard from this document"
                      >
                        <Sparkles size={12} />
                      </button>
                    )}

                    {!isAsset && (
                      <button
                        type="button"
                        onClick={() => startEdit(source, currentDocId)}
                        className="dv-source-btn dv-source-btn--icon"
                        title="Edit document title or category"
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDeletingId(isDeleting ? null : currentDocId);
                        setEditingId(null);
                      }}
                      className="dv-source-btn dv-source-btn--danger"
                      title={isAsset ? "Delete flashcard" : "Delete document"}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Inline Edit Bar */}
                {isEditing && (
                  <div className="dv-source-inline-drawer dv-anim-fade-in">
                    <input
                      type="text"
                      className="dv-source-inline-input"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Document title"
                      disabled={isBusy}
                    />
                    <input
                      type="text"
                      className="dv-source-inline-input dv-source-inline-input--sm"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      placeholder="Category"
                      disabled={isBusy}
                    />
                    <button
                      type="button"
                      className="dv-source-btn dv-source-btn--preview"
                      onClick={() => saveEdit(currentDocId)}
                      disabled={isBusy}
                    >
                      {isBusy ? (
                        <Loader2 size={12} className="dv-cp-spin" />
                      ) : (
                        <Check size={12} />
                      )}
                    </button>
                    <button
                      type="button"
                      className="dv-source-btn dv-source-btn--icon"
                      onClick={() => setEditingId(null)}
                      disabled={isBusy}
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                {/* Inline Delete Confirmation */}
                {isDeleting && (
                  <div className="dv-source-inline-drawer dv-source-inline-drawer--danger dv-anim-fade-in">
                    <span className="dv-source-inline-warn">
                      Permanently delete "{currentTitle}"?
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="dv-source-btn dv-source-btn--danger-solid"
                        onClick={() => confirmDelete(currentDocId, currentTitle, isAsset)}
                        disabled={isBusy}
                      >
                        {isBusy ? (
                          <Loader2 size={12} className="dv-cp-spin" />
                        ) : (
                          "Delete"
                        )}
                      </button>
                      <button
                        type="button"
                        className="dv-source-btn dv-source-btn--icon"
                        onClick={() => setDeletingId(null)}
                        disabled={isBusy}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {activeDoc && (
        <Modal
          isOpen={Boolean(activeDoc)}
          onClose={handleCloseDocViewer}
          title={String(activeDoc.title || "Document Preview")}
          maxWidth="920px"
          className="dv-viewer-modal-dialog"
        >
          <div className="dv-viewer-modal-content">
            <div className="dv-viewer-modal-bar">
              <div className="dv-viewer-modal-badges">
                <Badge variant="outline" size="sm">
                  {activeDoc.category || "Document"}
                </Badge>
                {(activeDoc.pageNumber || activeDoc.page) && (
                  <Badge variant="neutral" size="sm">
                    Page {activeDoc.pageNumber || activeDoc.page}
                  </Badge>
                )}
                {viewerScale !== 1 && (
                  <Badge variant="neutral" size="sm">
                    {Math.round(viewerScale * 100)}%
                  </Badge>
                )}
                {viewerRotation !== 0 && (
                  <Badge variant="neutral" size="sm">
                    {viewerRotation}°
                  </Badge>
                )}
              </div>
              <div className="dv-viewer-modal-actions">
                {previewUrl && (
                  <>
                    <div className="dv-viewer-zoom-controls">
                      <button
                        type="button"
                        onClick={handleZoomOut}
                        disabled={viewerScale <= 0.5}
                        className="dv-viewer-modal-btn dv-viewer-modal-btn--icon"
                        title="Zoom Out"
                        aria-label="Zoom Out"
                      >
                        <ZoomOut size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={handleResetZoom}
                        className="dv-viewer-modal-btn dv-viewer-modal-btn--scale"
                        title="Reset Zoom & Orientation"
                        aria-label="Reset Zoom and Rotation"
                      >
                        {Math.round(viewerScale * 100)}%
                      </button>
                      <button
                        type="button"
                        onClick={handleZoomIn}
                        disabled={viewerScale >= 2.5}
                        className="dv-viewer-modal-btn dv-viewer-modal-btn--icon"
                        title="Zoom In"
                        aria-label="Zoom In"
                      >
                        <ZoomIn size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={handleRotate}
                        className="dv-viewer-modal-btn dv-viewer-modal-btn--icon"
                        title="Rotate 90° clockwise"
                        aria-label="Rotate 90° clockwise"
                      >
                        <RotateCw size={14} />
                      </button>
                    </div>

                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="dv-viewer-modal-btn"
                      title="Open stream in a clean new tab"
                    >
                      <ExternalLink size={14} />
                      <span>Open in Tab</span>
                    </a>

                    {downloadUrl && (
                      <a
                        href={downloadUrl}
                        download={activeDoc?.title || "document"}
                        className="dv-viewer-modal-btn dv-viewer-modal-btn--download"
                        title="Download original file"
                      >
                        <Download size={14} />
                        <span>Download</span>
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>

            <div
              className="dv-viewer-frame-container"
              style={{ minHeight: "560px", position: "relative" }}
            >
              {previewUrl && (
                <iframe
                  src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
                  className="dv-viewer-iframe"
                  title={activeDoc.title}
                  style={{
                    width: "100%",
                    height: "560px",
                    border: "none",
                    borderRadius: "0 0 10px 10px",
                    transform: `scale(${viewerScale}) rotate(${viewerRotation}deg)`,
                    transformOrigin: "center center",
                    transition: "transform 0.2s ease",
                  }}
                />
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
