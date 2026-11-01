import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../services/api";
import { 
  Plus, Trash2, Calendar, FileText, Layers, ShieldCheck, 
  AlertCircle, ChevronRight, Car, Tv, Laptop, Home, Box, ExternalLink
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

const ASSET_CATEGORIES = ["Vehicle", "Home Appliances", "Electronics", "Real Estate", "Other"];

function getAssetIcon(category) {
  const c = (category || "").toLowerCase();
  if (c.includes("vehicle") || c.includes("car")) return Car;
  if (c.includes("appliance")) return Tv;
  if (c.includes("electronic") || c.includes("laptop")) return Laptop;
  if (c.includes("real estate") || c.includes("property")) return Home;
  return Box;
}

export default function AssetsPage() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    category: "Vehicle",
    estimatedValue: "",
    purchaseDate: "",
    warrantyExpiry: "",
    insuranceExpiry: "",
    nextService: "",
  });

  useEffect(() => {
    fetchAssets();
  }, []);

  async function fetchAssets() {
    try {
      setLoading(true);
      setError("");
      const res = await apiRequest("/api/assets");
      if (res.success && res.data) {
        setAssets(res.data);
      } else {
        setAssets([]);
      }
    } catch (err) {
      setError("Failed to load asset inventory.");
    } finally {
      setLoading(false);
    }
  }

  const handleInputChange = (field, val) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
  };

  const handleCreateAsset = async (e) => {
    e.preventDefault();
    if (!formData.name) return;

    setSubmitting(true);
    try {
      const res = await apiRequest("/api/assets", {
        method: "POST",
        body: JSON.stringify(formData),
      });

      if (res.success && res.data) {
        setAssets((prev) => [res.data, ...prev]);
        setShowAddModal(false);
        setFormData({
          name: "",
          category: "Vehicle",
          estimatedValue: "",
          purchaseDate: "",
          warrantyExpiry: "",
          insuranceExpiry: "",
          nextService: "",
        });
      }
    } catch (err) {
      alert("Failed to create asset: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAsset = async (id, assetName) => {
    if (!window.confirm(`Are you sure you want to remove "${assetName || 'this asset'}" from your registry?`)) return;
    try {
      const res = await apiRequest(`/api/assets/${id}`, { method: "DELETE" });
      if (res.success) {
        setAssets((prev) => prev.filter((a) => a._id !== id));
      }
    } catch (err) {
      alert("Failed to delete asset: " + err.message);
    }
  };

  return (
    <div className="dv-assets-page">
      <AppHeader
        title="Asset & Warranty Registry"
        subtitle="Track vehicles, home appliances, and electronics with cross-linked insurance and invoices."
      />

      <div className="dv-assets-content">
        <div className="dv-assets-toolbar">
          <div className="dv-assets-count">
            <strong>{assets.length}</strong> Registered Asset(s)
          </div>

          <Button
            variant="primary"
            size="md"
            icon={Plus}
            onClick={() => setShowAddModal(true)}
          >
            Add Asset
          </Button>
        </div>

        {error && (
          <div className="dv-assets-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="dv-assets-grid">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} padding="md" className="dv-asset-card">
                <Skeleton height="36px" width="36px" variant="circle" />
                <Skeleton height="20px" width="70%" style={{ marginTop: "12px" }} />
                <Skeleton height="14px" width="100%" style={{ marginTop: "8px" }} />
                <Skeleton height="14px" width="50%" />
              </Card>
            ))}
          </div>
        ) : assets.length === 0 ? (
          <EmptyState
            title="No tracked assets in registry"
            description="Add your car, laptop, air conditioner, or property deeds to cross-link warranties and policy schedules."
            actionLabel="Add Your First Asset"
            onAction={() => setShowAddModal(true)}
          />
        ) : (
          <div className="dv-assets-grid">
            {assets.map((asset) => {
              const AssetIcon = getAssetIcon(asset.category);
              const linkedDocs = asset.linkedDocumentIds || [];

              return (
                <Card key={asset._id} hover padding="md" className="dv-asset-card">
                  <div className="dv-asset-card__header">
                    <div className="dv-asset-card__type">
                      <div className="dv-asset-icon-box">
                        <AssetIcon size={18} />
                      </div>
                      <Badge variant="primary" size="sm">{asset.category}</Badge>
                    </div>

                    <button
                      type="button"
                      className="dv-asset-delete-btn"
                      onClick={() => handleDeleteAsset(asset._id, asset.name)}
                      aria-label="Delete Asset"
                      title="Remove Asset"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="dv-asset-card__body">
                    <h3 className="dv-asset-card__title">{asset.name}</h3>
                    {asset.estimatedValue && (
                      <span className="dv-asset-card__val">Value: {asset.estimatedValue}</span>
                    )}
                  </div>

                  <div className="dv-asset-card__dates">
                    {asset.purchaseDate && (
                      <div className="dv-asset-date-row">
                        <span className="dv-asset-date-label">Purchased:</span>
                        <span className="dv-asset-date-val">{asset.purchaseDate}</span>
                      </div>
                    )}
                    {asset.warrantyExpiry && (
                      <div className="dv-asset-date-row">
                        <span className="dv-asset-date-label">Warranty Expiry:</span>
                        <div className="dv-asset-date-flex">
                          <ExpiryBadge expiryDate={asset.warrantyExpiry} size="sm" />
                          <span className="dv-asset-date-val">{asset.warrantyExpiry}</span>
                        </div>
                      </div>
                    )}
                    {asset.insuranceExpiry && (
                      <div className="dv-asset-date-row">
                        <span className="dv-asset-date-label">Insurance Expiry:</span>
                        <div className="dv-asset-date-flex">
                          <ExpiryBadge expiryDate={asset.insuranceExpiry} size="sm" />
                          <span className="dv-asset-date-val">{asset.insuranceExpiry}</span>
                        </div>
                      </div>
                    )}
                    {asset.nextService && (
                      <div className="dv-asset-date-row">
                        <span className="dv-asset-date-label">Next Service:</span>
                        <span className="dv-asset-date-val">{asset.nextService}</span>
                      </div>
                    )}
                  </div>

                  <div className="dv-asset-card__footer">
                    <span className="dv-asset-linked-count">
                      <FileText size={13} /> {linkedDocs.length} Linked Document(s)
                    </span>
                    {linkedDocs.length > 0 && typeof linkedDocs[0] === 'object' && linkedDocs[0]._id && (
                      <Link to={`/documents/${linkedDocs[0]._id}`} className="dv-asset-inspect-link">
                        Inspect <ChevronRight size={13} />
                      </Link>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Asset Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Register Asset or Appliance"
      >
        <form onSubmit={handleCreateAsset} className="dv-asset-form">
          <Input
            label="Asset Name"
            placeholder="e.g. 2024 Honda City, MacBook Pro 16"
            value={formData.name}
            onChange={(e) => handleInputChange("name", e.target.value)}
            required
          />

          <div className="dv-form-group">
            <label className="dv-input-label">Category</label>
            <select
              className="dv-select-control"
              value={formData.category}
              onChange={(e) => handleInputChange("category", e.target.value)}
            >
              {ASSET_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <Input
            label="Estimated Value / Purchase Price"
            placeholder="e.g. $2,400 or ₹14,50,000"
            value={formData.estimatedValue}
            onChange={(e) => handleInputChange("estimatedValue", e.target.value)}
          />

          <Input
            label="Purchase Date"
            type="date"
            value={formData.purchaseDate}
            onChange={(e) => handleInputChange("purchaseDate", e.target.value)}
          />

          <Input
            label="Warranty Expiry Date"
            type="date"
            value={formData.warrantyExpiry}
            onChange={(e) => handleInputChange("warrantyExpiry", e.target.value)}
          />

          <Input
            label="Insurance Expiry Date"
            type="date"
            value={formData.insuranceExpiry}
            onChange={(e) => handleInputChange("insuranceExpiry", e.target.value)}
          />

          <Input
            label="Next Service Schedule"
            type="date"
            value={formData.nextService}
            onChange={(e) => handleInputChange("nextService", e.target.value)}
          />

          <div className="dv-modal-form-actions">
            <Button variant="ghost" type="button" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={submitting}>
              Save Asset
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
