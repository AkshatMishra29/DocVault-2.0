import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../services/api";
import { 
  Plus, Trash2, Edit3, Calendar, FileText, Layers, ShieldCheck, 
  AlertCircle, ChevronRight, Car, Tv, Laptop, Home, Box, Tag, 
  Search, X, Check, DollarSign, Clock, HelpCircle, Palette, Sparkles
} from "lucide-react";

import AppHeader from "../../components/layout/AppHeader/AppHeader";
import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Badge from "../../components/common/Badge/Badge";
import Input from "../../components/common/Input/Input";
import Modal from "../../components/common/Modal/Modal";
import EmptyState from "../../components/common/EmptyState/EmptyState";
import Skeleton from "../../components/common/Skeleton/Skeleton";
import ExpiryBadge from "../../components/common/ExpiryBadge/ExpiryBadge";

import "./AssetsPage.css";

// Common suggested fields users can quickly add with 1 click
const COMMON_FIELD_SUGGESTIONS = [
  { label: "Purchase Date", type: "date" },
  { label: "Purchase Price", type: "text" },
  { label: "Warranty Expiry", type: "date" },
  { label: "Insurance Expiry", type: "date" },
  { label: "Serial Number", type: "text" },
  { label: "Model Number", type: "text" },
  { label: "Registration / License No", type: "text" },
  { label: "Next Service / Renewal", type: "date" },
  { label: "Location / Room", type: "text" },
  { label: "Account / Policy No", type: "text" },
  { label: "Brand / Manufacturer", type: "text" }
];

const CARD_COLORS = [
  { id: "blue", label: "Blue" },
  { id: "purple", label: "Purple" },
  { id: "green", label: "Green" },
  { id: "amber", label: "Amber" },
  { id: "rose", label: "Rose" },
  { id: "indigo", label: "Indigo" },
  { id: "slate", label: "Slate" }
];

function getCategoryIcon(catName) {
  const c = (catName || "").toLowerCase();
  if (c.includes("vehicle") || c.includes("car") || c.includes("bike")) return Car;
  if (c.includes("appliance") || c.includes("tv") || c.includes("ac")) return Tv;
  if (c.includes("electronic") || c.includes("laptop") || c.includes("phone")) return Laptop;
  if (c.includes("property") || c.includes("home") || c.includes("real estate")) return Home;
  return Box;
}

export default function AssetsPage() {
  const [flashcards, setFlashcards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [walletMode, setWalletMode] = useState("all"); // 'all' | 'warranty' | 'vehicle'

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State - Fully customizable with no forced preset fields
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    description: "",
    cardColor: "blue",
    tags: [],
    customFields: [] // Array of { label, value, type }
  });

  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    fetchFlashcards();
  }, []);

  async function fetchFlashcards() {
    try {
      setLoading(true);
      setError("");
      const res = await apiRequest("/api/assets");
      if (res.success && res.data) {
        setFlashcards(res.data);
      } else {
        setFlashcards([]);
      }
    } catch (err) {
      setError("Failed to load flashcards.");
    } finally {
      setLoading(false);
    }
  }

  // Derive all unique categories created by the user
  const availableCategories = useMemo(() => {
    const set = new Set();
    flashcards.forEach(c => {
      if (c.category && c.category.trim()) set.add(c.category.trim());
    });
    return Array.from(set);
  }, [flashcards]);

  // Filtered Cards
  const filteredCards = useMemo(() => {
    return flashcards.filter(card => {
      // Wallet mode filter (Part C)
      if (walletMode === "warranty") {
        const cat = (card.category || "").toLowerCase();
        const hasWarrantyField = (card.customFields || []).some(f => 
          (f.label || "").toLowerCase().includes("warranty")
        );
        const isApplianceOrElectronic = 
          cat.includes("appliance") || cat.includes("electronic") || cat.includes("tv") || 
          cat.includes("laptop") || cat.includes("phone") || cat.includes("gadget") || 
          cat.includes("refrigerator") || cat.includes("ac");
        if (!hasWarrantyField && !isApplianceOrElectronic) return false;
      } else if (walletMode === "vehicle") {
        const cat = (card.category || "").toLowerCase();
        const isVehicle = 
          cat.includes("vehicle") || cat.includes("car") || cat.includes("bike") || 
          cat.includes("automobile") || cat.includes("scooter");
        if (!isVehicle) return false;
      }

      const matchesCategory = selectedCategory === "ALL" || card.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      if (!q) return matchesCategory;

      const inName = (card.name || "").toLowerCase().includes(q);
      const inCat = (card.category || "").toLowerCase().includes(q);
      const inDesc = (card.description || "").toLowerCase().includes(q);
      const inTags = (card.tags || []).some(t => t.toLowerCase().includes(q));
      const inFields = (card.customFields || []).some(f => 
        (f.label || "").toLowerCase().includes(q) || (f.value || "").toLowerCase().includes(q)
      );

      return matchesCategory && (inName || inCat || inDesc || inTags || inFields);
    });
  }, [flashcards, selectedCategory, searchQuery, walletMode]);

  const handleOpenCreateModal = () => {
    setEditingCardId(null);
    setFormData({
      name: "",
      category: "",
      description: "",
      cardColor: "blue",
      tags: [],
      // Default with zero forced presets; let user pick
      customFields: []
    });
    setTagInput("");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (card) => {
    setEditingCardId(card._id);
    
    // Normalize custom fields: include legacy fields if present
    const fields = Array.isArray(card.customFields) && card.customFields.length > 0 
      ? [...card.customFields]
      : [];

    if (fields.length === 0) {
      if (card.purchasePrice || card.estimatedValue) {
        fields.push({ label: "Purchase Price / Value", value: card.estimatedValue || String(card.purchasePrice), type: "text" });
      }
      if (card.purchaseDate) {
        fields.push({ label: "Purchase Date", value: card.purchaseDate, type: "date" });
      }
      if (card.warrantyExpiry) {
        fields.push({ label: "Warranty Expiry", value: card.warrantyExpiry, type: "date" });
      }
      if (card.insuranceExpiry) {
        fields.push({ label: "Insurance Expiry", value: card.insuranceExpiry, type: "date" });
      }
    }

    setFormData({
      name: card.name || "",
      category: card.category || "",
      description: card.description || "",
      cardColor: card.cardColor || "blue",
      tags: card.tags || [],
      customFields: fields
    });
    setTagInput("");
    setIsModalOpen(true);
  };

  const handleAddCustomField = (label = "", type = "text") => {
    setFormData(prev => ({
      ...prev,
      customFields: [...prev.customFields, { label, value: "", type }]
    }));
  };

  const handleUpdateCustomField = (index, key, val) => {
    setFormData(prev => {
      const next = [...prev.customFields];
      next[index] = { ...next[index], [key]: val };
      return { ...prev, customFields: next };
    });
  };

  const handleRemoveCustomField = (index) => {
    setFormData(prev => ({
      ...prev,
      customFields: prev.customFields.filter((_, i) => i !== index)
    }));
  };

  const handleAddTag = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = tagInput.trim().replace(/^#/, "");
      if (val && !formData.tags.includes(val)) {
        setFormData(prev => ({ ...prev, tags: [...prev.tags, val] }));
      }
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tagToRemove)
    }));
  };

  const handleSaveFlashcard = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setSubmitting(true);
    try {
      // Sync known common dates/prices from custom fields back to top-level model fields for deadlines & timeline compatibility
      const payload = {
        name: formData.name.trim(),
        category: formData.category.trim() || "General",
        description: formData.description.trim(),
        cardColor: formData.cardColor,
        tags: formData.tags,
        customFields: formData.customFields.filter(f => f.label.trim().length > 0)
      };

      // Extract common fields if user provided them
      formData.customFields.forEach(f => {
        const lbl = (f.label || "").toLowerCase();
        if (lbl.includes("warranty") && f.value) payload.warrantyExpiry = f.value;
        if (lbl.includes("insurance") && f.value) payload.insuranceExpiry = f.value;
        if ((lbl.includes("purchase date") || lbl === "date") && f.value) payload.purchaseDate = f.value;
        if (lbl.includes("service") && f.value) payload.nextService = f.value;
        if ((lbl.includes("price") || lbl.includes("value")) && f.value) {
          payload.estimatedValue = f.value;
          const num = parseFloat(f.value.replace(/[^0-9.-]+/g, ""));
          if (!isNaN(num)) payload.purchasePrice = num;
        }
      });

      if (editingCardId) {
        const res = await apiRequest(`/api/assets/${editingCardId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        if (res.success && res.data) {
          setFlashcards(prev => prev.map(c => c._id === editingCardId ? res.data : c));
          setIsModalOpen(false);
        }
      } else {
        const res = await apiRequest("/api/assets", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        if (res.success && res.data) {
          setFlashcards(prev => [res.data, ...prev]);
          setIsModalOpen(false);
        }
      }
    } catch (err) {
      alert("Failed to save flashcard: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFlashcard = async (id, title) => {
    if (!window.confirm(`Are you sure you want to remove the flashcard "${title || 'this card'}"?`)) return;
    try {
      const res = await apiRequest(`/api/assets/${id}`, { method: "DELETE" });
      if (res.success) {
        setFlashcards(prev => prev.filter(c => c._id !== id));
      }
    } catch (err) {
      alert("Failed to delete flashcard: " + err.message);
    }
  };

  return (
    <div className="dv-flashcards-page">
      <AppHeader
        title="My Assets"
        subtitle="Track your vehicles, appliances, and properties."
      />

      <div className="dv-flashcards-content">
        {/* Apple Zen 3D Flashcards Command Hero */}
        <div className="dv-flash-hero">
          <div className="dv-flash-hero__info">
            <h2 className="dv-flash-hero__title">
              My <span className="dv-flash-hero__title-accent">Assets</span>
            </h2>
            <p className="dv-flash-hero__desc">
              Track your physical assets and their documents.
            </p>
          </div>

          <div className="dv-flash-hero__actions">
            <Button
              variant="primary"
              size="md"
              icon={Plus}
              onClick={handleOpenCreateModal}
            >
              Create Flashcard
            </Button>
            <Link to="/documents">
              <Button variant="outline" size="md" icon={FileText}>
                Link Documents
              </Button>
            </Link>
          </div>
        </div>

        {/* Smart Wallet View Switcher (Part C) */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            className={`dv-filter-pill ${walletMode === "all" ? "dv-filter-pill--active" : ""}`}
            onClick={() => setWalletMode("all")}
          >
            <Layers size={13} style={{ display: "inline", marginRight: "6px" }} />
            All Assets ({flashcards.length})
          </button>
          <button
            type="button"
            className={`dv-filter-pill ${walletMode === "warranty" ? "dv-filter-pill--active" : ""}`}
            onClick={() => setWalletMode("warranty")}
          >
            <ShieldCheck size={13} style={{ display: "inline", marginRight: "6px" }} />
            🛡️ Warranty Wallet (Appliances & Gadgets)
          </button>
          <button
            type="button"
            className={`dv-filter-pill ${walletMode === "vehicle" ? "dv-filter-pill--active" : ""}`}
            onClick={() => setWalletMode("vehicle")}
          >
            <Car size={13} style={{ display: "inline", marginRight: "6px" }} />
            🚗 Vehicle Glove Box (RC, Insurance, PUC, DL)
          </button>
        </div>

        {/* Informative Banner for Active Wallet Mode */}
        {walletMode === "warranty" && (
          <div style={{
            padding: "12px 18px",
            background: "rgba(139, 92, 246, 0.08)",
            border: "1px solid rgba(139, 92, 246, 0.25)",
            borderRadius: "14px",
            display: "flex",
            alignItems: "center",
            gap: "12px"
          }}>
            <ShieldCheck size={20} color="#A855F7" />
            <div style={{ fontSize: "12.5px", color: "var(--color-text-secondary)" }}>
              <strong style={{ color: "var(--color-text-primary)", display: "block" }}>
                Household Appliance & Electronics Warranty Wallet
              </strong>
              Never lose a purchase invoice or miss a warranty period again. All items sorted by warranty protection.
            </div>
          </div>
        )}

        {walletMode === "vehicle" && (
          <div style={{
            padding: "12px 18px",
            background: "rgba(59, 130, 246, 0.08)",
            border: "1px solid rgba(59, 130, 246, 0.25)",
            borderRadius: "14px",
            display: "flex",
            alignItems: "center",
            gap: "12px"
          }}>
            <Car size={20} color="#3B82F6" />
            <div style={{ fontSize: "12.5px", color: "var(--color-text-secondary)" }}>
              <strong style={{ color: "var(--color-text-primary)", display: "block" }}>
                Digital Glove Box — 4-Point Motoring Compliance
              </strong>
              Keep your RC, Motor Insurance, PUC (Pollution), and Driving License verified and ready for traffic checks.
            </div>
          </div>
        )}

        {/* Search, Filter & Glass Toolbar */}
        <div className="dv-flashcards-toolbar">
          <div className="dv-flashcards-search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search flashcards by name, category, or field..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button 
                type="button" 
                onClick={() => setSearchQuery("")}
                className="dv-search-clear-btn"
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="dv-flashcards-filter-tags">
            <button
              type="button"
              className={`dv-filter-pill ${selectedCategory === "ALL" ? "dv-filter-pill--active" : ""}`}
              onClick={() => setSelectedCategory("ALL")}
            >
              All Cards ({flashcards.length})
            </button>
            {availableCategories.map(cat => (
              <button
                key={cat}
                type="button"
                className={`dv-filter-pill ${selectedCategory === cat ? "dv-filter-pill--active" : ""}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            icon={Plus}
            onClick={handleOpenCreateModal}
            className="dv-toolbar-create-btn"
          >
            New Card
          </Button>
        </div>

        {error && (
          <div className="dv-assets-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Flashcards Grid */}
        {loading ? (
          <div className="dv-flashcards-grid">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} padding="md" className="dv-flashcard">
                <Skeleton height="6px" width="100%" />
                <div style={{ padding: "16px" }}>
                  <Skeleton height="36px" width="36px" variant="circle" />
                  <Skeleton height="20px" width="70%" style={{ marginTop: "12px" }} />
                  <Skeleton height="14px" width="100%" style={{ marginTop: "8px" }} />
                </div>
              </Card>
            ))}
          </div>
        ) : filteredCards.length === 0 ? (
          <EmptyState
            title={searchQuery || selectedCategory !== "ALL" ? "No matching flashcards" : "No Flashcards Created Yet"}
            description="Create your first fully customizable card. Add custom fields, categories, tags, or links to vault documents."
            actionLabel="Create Flashcard"
            onAction={handleOpenCreateModal}
          />
        ) : (
          <div className="dv-flashcards-grid">
            {filteredCards.map((card) => {
              const IconComponent = getCategoryIcon(card.category);
              const colorTheme = card.cardColor || "blue";
              const linkedDocs = card.linkedDocumentIds || [];
              const fields = card.customFields && card.customFields.length > 0
                ? card.customFields
                : [
                    card.purchaseDate ? { label: "Purchased", value: card.purchaseDate } : null,
                    card.estimatedValue ? { label: "Value", value: card.estimatedValue } : null,
                    card.warrantyExpiry ? { label: "Warranty", value: card.warrantyExpiry } : null,
                    card.insuranceExpiry ? { label: "Insurance", value: card.insuranceExpiry } : null
                  ].filter(Boolean);

              return (
                <div key={card._id} className={`dv-flashcard dv-flashcard--${colorTheme}`}>
                  <div className="dv-flashcard__accent-bar" />
                  
                  <div className="dv-flashcard__header">
                    <div className="dv-flashcard__icon-wrap">
                      <IconComponent size={20} />
                    </div>

                    <div className="dv-flashcard__meta-top">
                      <span className="dv-flashcard__category">{card.category || "General"}</span>
                      <h3 className="dv-flashcard__title" title={card.name}>{card.name}</h3>
                    </div>

                    <div className="dv-flashcard__actions">
                      <button
                        type="button"
                        className="dv-flashcard__btn-icon"
                        onClick={() => handleOpenEditModal(card)}
                        title="Customize / Edit Card"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        type="button"
                        className="dv-flashcard__btn-icon dv-flashcard__btn-icon--danger"
                        onClick={() => handleDeleteFlashcard(card._id, card.name)}
                        title="Delete Card"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="dv-flashcard__body">
                    {card.description && (
                      <p className="dv-flashcard__desc">{card.description}</p>
                    )}

                    {/* Display Dynamic Custom Fields */}
                    {fields.length > 0 && (
                      <div className="dv-flashcard__fields">
                        {fields.slice(0, 6).map((f, idx) => (
                          <div key={idx} className="dv-flashcard__field-item">
                            <span className="dv-flashcard__field-label">{f.label}</span>
                            <span className="dv-flashcard__field-val">{f.value || "—"}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Tags */}
                    {card.tags && card.tags.length > 0 && (
                      <div className="dv-flashcard__tags">
                        {card.tags.map(t => (
                          <span key={t} className="dv-flashcard__tag">
                            <Tag size={10} /> #{t}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Digital Glove Box 4-slot indicator for vehicles (Part C) */}
                    {(card.category || "").toLowerCase().match(/vehicle|car|bike|scooter|auto/) && (
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: "4px",
                        margin: "10px 0 4px",
                        padding: "6px",
                        background: "var(--color-surface-secondary)",
                        borderRadius: "8px",
                        fontSize: "10px",
                        textAlign: "center",
                        fontWeight: "600"
                      }}>
                        <span style={{ color: "#22C55E" }}>✓ RC</span>
                        <span style={{ color: "#3B82F6" }}>✓ Insure</span>
                        <span style={{ color: "#F59E0B" }}>• PUC</span>
                        <span style={{ color: "var(--color-text-secondary)" }}>• DL</span>
                      </div>
                    )}
                  </div>

                  <div className="dv-flashcard__footer">
                    <span className="dv-flashcard__doc-count">
                      <FileText size={13} /> {linkedDocs.length} Document(s)
                    </span>
                    <Link to={`/assets/${card._id}`} className="dv-flashcard__link-btn">
                      Lifecycle & Docs <ChevronRight size={13} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Fully Customizable Flashcard Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCardId ? "Edit Asset" : "Add New Asset"}
      >
        <form onSubmit={handleSaveFlashcard} className="dv-asset-form">
          <Input
            label="Card Title / Asset Name"
            placeholder="e.g. MacBook Pro M3, Family Car, Apartment 4B, Canon EOS"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            required
          />

          <div className="dv-custom-modal-grid">
            <Input
              label="Category / Folder"
              placeholder="e.g. Work, Vehicle, Camera, Home"
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
            />

            <div className="dv-form-group">
              <label className="dv-input-label">Card Theme Color</label>
              <div className="dv-color-selector">
                {CARD_COLORS.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={`dv-color-dot dv-color-dot--${c.id} ${formData.cardColor === c.id ? "dv-color-dot--active" : ""}`}
                    onClick={() => setFormData(prev => ({ ...prev, cardColor: c.id }))}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </div>

          <Input
            label="Notes / Brief Description"
            placeholder="Add any context, location, or private reminders..."
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          />

          {/* Quick-add Common Fields Selector */}
          <div className="dv-form-group">
            <label className="dv-input-label">
              Add Common Fields: <span style={{ fontWeight: 'normal', color: 'var(--color-text-secondary)' }}>(Click to add instantly)</span>
            </label>
            <div className="dv-field-picker-row">
              {COMMON_FIELD_SUGGESTIONS.map(s => {
                const alreadyAdded = formData.customFields.some(f => f.label.toLowerCase() === s.label.toLowerCase());
                return (
                  <button
                    key={s.label}
                    type="button"
                    className="dv-picker-chip"
                    onClick={() => handleAddCustomField(s.label, s.type)}
                    disabled={alreadyAdded}
                    style={{ opacity: alreadyAdded ? 0.4 : 1 }}
                  >
                    <Plus size={12} /> {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Fields List Builder */}
          <div className="dv-form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="dv-input-label" style={{ margin: 0 }}>Custom Fields ({formData.customFields.length})</label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={Plus}
                onClick={() => handleAddCustomField("Custom Field", "text")}
              >
                Add Blank Field
              </Button>
            </div>

            {formData.customFields.length === 0 ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontStyle: 'italic', padding: '8px 0' }}>
                No fields added yet. Click any button above or "Add Blank Field" to customize this card.
              </div>
            ) : (
              <div className="dv-custom-fields-builder">
                {formData.customFields.map((field, idx) => (
                  <div key={idx} className="dv-custom-field-row">
                    <input
                      type="text"
                      className="dv-input"
                      placeholder="Field Name (e.g. Serial No)"
                      style={{ flex: 1 }}
                      value={field.label}
                      onChange={(e) => handleUpdateCustomField(idx, "label", e.target.value)}
                    />
                    <input
                      type={field.type || "text"}
                      className="dv-input"
                      placeholder="Value"
                      style={{ flex: 1.4 }}
                      value={field.value}
                      onChange={(e) => handleUpdateCustomField(idx, "value", e.target.value)}
                    />
                    <button
                      type="button"
                      className="dv-flashcard__btn-icon dv-flashcard__btn-icon--danger"
                      onClick={() => handleRemoveCustomField(idx)}
                      title="Remove Field"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="dv-form-group">
            <label className="dv-input-label">Tags (Press Enter)</label>
            <Input
              placeholder="e.g. work, tax-deductible, warranty-active"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
            />
            {formData.tags.length > 0 && (
              <div className="dv-flashcard__tags" style={{ marginTop: '6px' }}>
                {formData.tags.map(t => (
                  <span key={t} className="dv-flashcard__tag">
                    #{t}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, marginLeft: 2 }}
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="dv-modal-form-actions">
            <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={submitting}>
              {editingCardId ? "Save Changes" : "Create Card"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
