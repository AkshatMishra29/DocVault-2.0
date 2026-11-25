import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Layers,
  Plus,
  Trash2,
  Check,
  Sparkles,
  FileText,
  ExternalLink,
  Edit3,
  Loader2,
  Palette,
  X,
} from "lucide-react";
import { API_BASE_URL } from "../../../services/api/apiClient";

const CARD_COLORS = [
  { id: "blue", label: "Blue", gradient: "linear-gradient(135deg, #2563EB, #356AE6)" },
  { id: "purple", label: "Purple", gradient: "linear-gradient(135deg, #7C3AED, #6366F1)" },
  { id: "green", label: "Green", gradient: "linear-gradient(135deg, #059669, #10B981)" },
  { id: "amber", label: "Amber", gradient: "linear-gradient(135deg, #D97706, #F59E0B)" },
  { id: "rose", label: "Rose", gradient: "linear-gradient(135deg, #E11D48, #F43F5E)" },
  { id: "indigo", label: "Indigo", gradient: "linear-gradient(135deg, #4338CA, #3B82F6)" },
  { id: "slate", label: "Slate", gradient: "linear-gradient(135deg, #334155, #475569)" },
];

const QUICK_CATEGORIES = [
  "Electronics",
  "Vehicle",
  "Appliance",
  "Utility",
  "Property",
  "Insurance",
];

const SUGGESTED_FIELDS = [
  { label: "Purchase Date", type: "date" },
  { label: "Purchase Price", type: "text" },
  { label: "Warranty Expiry", type: "date" },
  { label: "Serial Number", type: "text" },
  { label: "Model Number", type: "text" },
  { label: "Account / Policy No", type: "text" },
  { label: "Brand / Provider", type: "text" },
];

export default function FlashcardWidget({ draft, onSaved, onCancel }) {
  const [name, setName] = useState(draft?.name || "");
  const [category, setCategory] = useState(draft?.category || "Electronics");
  const [cardColor, setCardColor] = useState(draft?.cardColor || "blue");
  const [description, setDescription] = useState(draft?.description || "");
  const [customFields, setCustomFields] = useState(
    Array.isArray(draft?.customFields) && draft.customFields.length > 0
      ? draft.customFields
      : [
          { label: "Purchase Date", value: "", type: "date" },
          { label: "Warranty Expiry", value: "", type: "date" },
        ]
  );

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [savedAsset, setSavedAsset] = useState(null);
  const [isEditingSaved, setIsEditingSaved] = useState(false);

  const handleDeleteSaved = async () => {
    if (!savedAsset?._id) return;
    setDeleting(true);
    setError("");
    try {
      const token =
        localStorage.getItem("docvault_token") ||
        localStorage.getItem("token") ||
        "";
      const res = await fetch(`${API_BASE_URL}/api/assets/${savedAsset._id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete flashcard.");
      }
      if (onCancel) onCancel();
    } catch (err) {
      setError(err.message || "Error deleting flashcard.");
    } finally {
      setDeleting(false);
    }
  };

  const activeGradient =
    CARD_COLORS.find((c) => c.id === cardColor)?.gradient ||
    CARD_COLORS[0].gradient;

  const handleAddField = (label = "", type = "text") => {
    setCustomFields((prev) => [...prev, { label, value: "", type }]);
  };

  const handleFieldChange = (idx, key, val) => {
    setCustomFields((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, [key]: val } : f))
    );
  };

  const handleRemoveField = (idx) => {
    setCustomFields((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter a Flashcard name.");
      return;
    }

    setSaving(true);
    setError("");

    const validFields = customFields.filter((f) => f.label && f.label.trim());
    const purchaseDateField = validFields.find((f) =>
      /purchase\s*date/i.test(f.label)
    );
    const warrantyField = validFields.find((f) =>
      /warranty\s*expiry/i.test(f.label)
    );

    const payload = {
      name: name.trim(),
      category: category.trim() || "General",
      cardColor,
      description: description.trim(),
      customFields: validFields,
      purchaseDate: purchaseDateField?.value || undefined,
      warrantyExpiry: warrantyField?.value || undefined,
      linkedDocumentIds: draft?.linkedDocumentId ? [draft.linkedDocumentId] : [],
    };

    try {
      const token =
        localStorage.getItem("docvault_token") ||
        localStorage.getItem("token") ||
        "";

      const isUpdate = Boolean(savedAsset?._id);
      const url = isUpdate
        ? `${API_BASE_URL}/api/assets/${savedAsset._id}`
        : `${API_BASE_URL}/api/assets`;

      const res = await fetch(url, {
        method: isUpdate ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save flashcard.");
      }

      const asset = data.data || data.asset;
      setSavedAsset(asset);
      setIsEditingSaved(false);
      if (onSaved) onSaved(asset);
    } catch (err) {
      setError(err.message || "Error saving flashcard.");
    } finally {
      setSaving(false);
    }
  };

  // Saved / Live Flashcard Display View
  if (savedAsset && !isEditingSaved) {
    return (
      <div className="dv-cp-flashcard dv-cp-flashcard--saved dv-anim-pop">
        <div
          className="dv-cp-flashcard__banner"
          style={{ background: activeGradient }}
        >
          <div className="dv-cp-flashcard__banner-left">
            <div className="dv-cp-flashcard__icon-wrap">
              <Layers size={18} />
            </div>
            <div>
              <div className="dv-cp-flashcard__saved-badge">
                <Check size={11} /> Saved to Vault
              </div>
              <h4 className="dv-cp-flashcard__title">{savedAsset.name}</h4>
            </div>
          </div>
          <span className="dv-cp-flashcard__cat-pill">
            {savedAsset.category}
          </span>
        </div>

        <div className="dv-cp-flashcard__body">
          {savedAsset.description && (
            <p className="dv-cp-flashcard__desc">{savedAsset.description}</p>
          )}

          {savedAsset.customFields && savedAsset.customFields.length > 0 && (
            <div className="dv-cp-flashcard__grid">
              {savedAsset.customFields.map((f, idx) => (
                <div key={idx} className="dv-cp-flashcard__stat">
                  <span className="dv-cp-flashcard__stat-label">{f.label}</span>
                  <span className="dv-cp-flashcard__stat-val">
                    {f.value || "—"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {draft?.linkedDocumentTitle && (
            <div className="dv-cp-flashcard__linked-doc">
              <FileText size={13} />
              <span>Linked: {draft.linkedDocumentTitle}</span>
            </div>
          )}

          <div className="dv-cp-flashcard__footer">
            {confirmDelete ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: "auto" }}>
                <span className="dv-source-inline-warn">Delete permanently?</span>
                <button
                  type="button"
                  className="dv-source-btn dv-source-btn--danger-solid"
                  onClick={handleDeleteSaved}
                  disabled={deleting}
                >
                  {deleting ? <Loader2 size={12} className="dv-cp-spin" /> : "Confirm"}
                </button>
                <button
                  type="button"
                  className="dv-cp-btn-ghost"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="dv-source-btn dv-source-btn--danger"
                style={{ marginRight: "auto", height: 32, padding: "0 10px" }}
                onClick={() => setConfirmDelete(true)}
                title="Delete this flashcard"
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            )}

            <button
              type="button"
              className="dv-cp-btn-ghost"
              onClick={() => setIsEditingSaved(true)}
            >
              <Edit3 size={13} /> Edit Flashcard
            </button>
            <Link
              to={`/assets/${savedAsset._id}`}
              className="dv-cp-btn-primary"
              style={{ textDecoration: "none" }}
            >
              <span>Open in Assets</span>
              <ExternalLink size={13} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Interactive Fillable Flashcard Form View
  return (
    <form
      className="dv-cp-flashcard dv-cp-flashcard--form dv-anim-slide-up"
      onSubmit={handleSave}
    >
      <div
        className="dv-cp-flashcard__banner"
        style={{ background: activeGradient }}
      >
        <div className="dv-cp-flashcard__banner-left">
          <div className="dv-cp-flashcard__icon-wrap">
            <Sparkles size={17} />
          </div>
          <div>
            <div className="dv-cp-flashcard__saved-badge">
              Interactive Flashcard Builder
            </div>
            <h4 className="dv-cp-flashcard__title">
              {name.trim() || "New Asset Flashcard"}
            </h4>
          </div>
        </div>

        <div className="dv-cp-flashcard__colors" title="Choose Card Theme">
          <Palette size={13} style={{ opacity: 0.85, marginRight: 2 }} />
          {CARD_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`dv-cp-color-dot ${
                cardColor === c.id ? "dv-cp-color-dot--active" : ""
              }`}
              style={{ background: c.gradient }}
              onClick={() => setCardColor(c.id)}
              aria-label={`Select ${c.label} theme`}
              title={c.label}
            />
          ))}
          {onCancel && !savedAsset && (
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              title="Delete / Remove empty flashcard"
              aria-label="Remove empty flashcard"
              style={{
                marginLeft: 8,
                background: "rgba(255,255,255,0.2)",
                border: "none",
                borderRadius: "6px",
                color: "#FFFFFF",
                width: 24,
                height: 24,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="dv-cp-flashcard__body">
        <div className="dv-cp-flashcard__row-2">
          <div className="dv-cp-intake-card__field">
            <label className="dv-cp-intake-card__label">Flashcard Name *</label>
            <input
              type="text"
              className="dv-cp-intake-card__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. MacBook Pro 16, Electricity Bill"
              required
            />
          </div>

          <div className="dv-cp-intake-card__field">
            <label className="dv-cp-intake-card__label">Category</label>
            <input
              type="text"
              className="dv-cp-intake-card__input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Electronics"
            />
          </div>
        </div>

        <div className="dv-cp-flashcard__quick-cats">
          {QUICK_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`dv-cp-mini-pill ${
                category === cat ? "dv-cp-mini-pill--active" : ""
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="dv-cp-intake-card__field">
          <label className="dv-cp-intake-card__label">
            Notes / Summary (Optional)
          </label>
          <input
            type="text"
            className="dv-cp-intake-card__input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description or key highlights..."
          />
        </div>

        <div className="dv-cp-intake-card__field">
          <div className="dv-cp-flashcard__fields-head">
            <label className="dv-cp-intake-card__label">
              Custom Flashcard Fields
            </label>
            <button
              type="button"
              className="dv-cp-add-field-btn"
              onClick={() => handleAddField("", "text")}
            >
              <Plus size={12} /> Add Field
            </button>
          </div>

          <div className="dv-cp-flashcard__suggestions">
            {SUGGESTED_FIELDS.filter(
              (sf) =>
                !customFields.some(
                  (cf) => cf.label.toLowerCase() === sf.label.toLowerCase()
                )
            )
              .slice(0, 4)
              .map((sf) => (
                <button
                  key={sf.label}
                  type="button"
                  className="dv-cp-suggest-chip"
                  onClick={() => handleAddField(sf.label, sf.type)}
                >
                  + {sf.label}
                </button>
              ))}
          </div>

          <div className="dv-cp-flashcard__field-list">
            {customFields.map((field, idx) => (
              <div key={idx} className="dv-cp-flashcard__field-row">
                <input
                  type="text"
                  className="dv-cp-intake-card__input"
                  placeholder="Field name"
                  value={field.label}
                  onChange={(e) =>
                    handleFieldChange(idx, "label", e.target.value)
                  }
                />
                <input
                  type={field.type === "date" ? "date" : "text"}
                  className="dv-cp-intake-card__input"
                  placeholder="Value..."
                  value={field.value}
                  onChange={(e) =>
                    handleFieldChange(idx, "value", e.target.value)
                  }
                />
                <button
                  type="button"
                  className="dv-cp-action-btn"
                  onClick={() => handleRemoveField(idx)}
                  title="Remove field"
                  aria-label="Remove field"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {draft?.linkedDocumentTitle && (
          <div className="dv-cp-flashcard__linked-doc">
            <FileText size={13} />
            <span>Attaching Document: {draft.linkedDocumentTitle}</span>
          </div>
        )}

        {error && <div className="dv-cp-confirm-card__error">{error}</div>}

        <div className="dv-cp-flashcard__footer">
          {onCancel && !savedAsset && (
            <button
              type="button"
              className="dv-cp-btn-ghost"
              onClick={onCancel}
              disabled={saving}
            >
              Dismiss
            </button>
          )}
          <button
            type="submit"
            className="dv-cp-btn-primary"
            disabled={saving || !name.trim()}
          >
            {saving ? (
              <>
                <Loader2 size={14} className="dv-cp-spin" /> Saving...
              </>
            ) : (
              <>
                <Check size={14} />{" "}
                {savedAsset ? "Update Flashcard" : "Save Flashcard to Vault"}
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
