import React, { useState } from "react";
import { FileText, ExternalLink } from "lucide-react";
import Modal from "../../../components/common/Modal/Modal";
import { API_BASE_URL } from "../../../services/api/apiClient";

export default function SourceChips({ sources = [] }) {
  const [activeDoc, setActiveDoc] = useState(null);

  if (!sources || sources.length === 0) return null;

  const handleOpenDoc = (src) => {
    setActiveDoc(src);
  };

  const previewUrl = activeDoc
    ? `${API_BASE_URL}/api/documents/${activeDoc.documentId}/preview?token=${localStorage.getItem("token") || ""}`
    : "";

  return (
    <>
      <div className="dv-cp-sources">
        <span className="dv-cp-sources__label">Sources:</span>
        <div className="dv-cp-sources__list">
          {sources.map((src, idx) => (
            <button
              key={`${src.documentId}-${src.page}-${idx}`}
              type="button"
              className="dv-cp-source-chip"
              onClick={() => handleOpenDoc(src)}
              title={`View document: ${src.title} (Page ${src.page})`}
            >
              <FileText size={12} />
              <span className="dv-cp-source-chip__title">{src.title}</span>
              <span className="dv-cp-source-chip__page">p.{src.page}</span>
            </button>
          ))}
        </div>
      </div>

      {activeDoc && (
        <Modal
          isOpen={Boolean(activeDoc)}
          onClose={() => setActiveDoc(null)}
          title={`Document Preview: ${activeDoc.title} (Page ${activeDoc.page})`}
          size="lg"
        >
          <div className="dv-cp-preview-modal-body">
            <iframe
              src={previewUrl}
              className="dv-cp-preview-iframe"
              title={activeDoc.title}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
