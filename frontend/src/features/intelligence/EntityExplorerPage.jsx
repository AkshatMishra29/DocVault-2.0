import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import {
  Layers,
  Search,
  Plus,
  Car,
  Home,
  User,
  Package,
  ShieldCheck,
  FileText,
  ArrowRight,
  Filter,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

import AppHeader from '../../components/layout/AppHeader/AppHeader';
import Card from '../../components/common/Card/Card';
import Button from '../../components/common/Button/Button';
import Badge from '../../components/common/Badge/Badge';
import Input from '../../components/common/Input/Input';
import Modal from '../../components/common/Modal/Modal';
import Skeleton from '../../components/common/Skeleton/Skeleton';
import EmptyState from '../../components/common/EmptyState/EmptyState';

import './EntityExplorerPage.css';

const TYPE_ICONS = {
  PERSON: User,
  VEHICLE: Car,
  PROPERTY: Home,
  PRODUCT: Package,
  INSURANCE_POLICY: ShieldCheck,
  OTHER: Layers,
};

const FILTER_TABS = [
  { key: 'ALL', label: 'All Entities' },
  { key: 'PERSON', label: 'People' },
  { key: 'VEHICLE', label: 'Vehicles' },
  { key: 'PROPERTY', label: 'Properties' },
  { key: 'PRODUCT', label: 'Products' },
  { key: 'INSURANCE_POLICY', label: 'Policies' },
];

export default function EntityExplorerPage() {
  const navigate = useNavigate();

  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New Entity Form State
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('VEHICLE');
  const [formRole, setFormRole] = useState('');
  const [formIdentifier, setFormIdentifier] = useState('');
  const [creating, setCreating] = useState(false);

  async function loadEntities() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedType !== 'ALL') params.append('type', selectedType);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await apiRequest(`/api/intelligence/entities?${params.toString()}`);
      if (res.success && res.data) {
        setEntities(res.data.entities || []);
      }
    } catch (err) {
      console.warn('Failed loading entities:', err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntities();
  }, [selectedType, searchQuery]);

  async function handleCreateEntity(e) {
    e.preventDefault();
    if (!formName.trim()) return;

    try {
      setCreating(true);
      const attributes = {};
      if (formRole) attributes.role = formRole;
      if (formIdentifier) attributes.registrationNumber = formIdentifier;

      const res = await apiRequest('/api/intelligence/entities', {
        method: 'POST',
        body: JSON.stringify({
          name: formName.trim(),
          entityType: formType,
          attributes,
        }),
      });

      if (res.success && res.data) {
        setShowCreateModal(false);
        setFormName('');
        setFormRole('');
        setFormIdentifier('');
        await loadEntities();
      } else {
        alert(res.error || 'Failed to create entity');
      }
    } catch (err) {
      alert(err.message || 'Error creating entity');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="entity-explorer-page">
      <AppHeader
        title="Knowledge Graph & Entities"
        subtitle="Connected relationships across your family, assets, documents, and policies"
        action={
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} />
            <span>Add Entity</span>
          </Button>
        }
      />

      {/* Filter Tabs */}
      <div className="entity-filter-bar">
        <div className="filter-tab-group">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`filter-tab-pill ${selectedType === tab.key ? 'active' : ''}`}
              onClick={() => setSelectedType(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="entity-search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search entities or aliases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Entity Cards Grid */}
      {loading ? (
        <div className="entity-card-grid">
          <Skeleton height={180} />
          <Skeleton height={180} />
          <Skeleton height={180} />
          <Skeleton height={180} />
        </div>
      ) : entities.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No entities found"
          description={
            searchQuery
              ? `No entities match "${searchQuery}" in this category.`
              : 'Sync your assets or add people, vehicles, and properties to build your Knowledge Graph.'
          }
          action={
            <Button size="sm" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} />
              <span>Create First Entity</span>
            </Button>
          }
        />
      ) : (
        <div className="entity-card-grid">
          {entities.map((entity) => {
            const Icon = TYPE_ICONS[entity.entityType] || Layers;
            const docCount = entity.linkedDocumentIds ? entity.linkedDocumentIds.length : 0;

            return (
              <Card key={entity._id} className="entity-profile-card">
                <div className="entity-card-top">
                  <div className={`entity-type-badge type-${entity.entityType.toLowerCase()}`}>
                    <Icon size={18} />
                    <span>{entity.entityType}</span>
                  </div>
                  <span className="entity-doc-pill">
                    <FileText size={12} />
                    {docCount} {docCount === 1 ? 'doc' : 'docs'}
                  </span>
                </div>

                <h3 className="entity-card-name">{entity.name}</h3>

                {/* Key Attributes summary */}
                <div className="entity-attributes-preview">
                  {entity.attributes?.registrationNumber && (
                    <div className="attr-row">
                      <span className="attr-key">Reg No:</span>
                      <span className="attr-val font-mono">{entity.attributes.registrationNumber}</span>
                    </div>
                  )}
                  {entity.attributes?.role && (
                    <div className="attr-row">
                      <span className="attr-key">Role:</span>
                      <span className="attr-val">{entity.attributes.role}</span>
                    </div>
                  )}
                  {entity.attributes?.category && (
                    <div className="attr-row">
                      <span className="attr-key">Category:</span>
                      <span className="attr-val">{entity.attributes.category}</span>
                    </div>
                  )}
                  {entity.aliases && entity.aliases.length > 0 && (
                    <div className="attr-row">
                      <span className="attr-key">Aliases:</span>
                      <span className="attr-val">{entity.aliases.join(', ')}</span>
                    </div>
                  )}
                </div>

                <div className="entity-card-bottom">
                  <Button
                    variant="outline"
                    size="sm"
                    className="view-entity-btn"
                    onClick={() => navigate(`/intelligence/entities/${entity._id}`)}
                  >
                    <span>View Profile & Graph</span>
                    <ArrowRight size={14} />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Entity Modal */}
      {showCreateModal && (
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Add New Entity to Graph"
        >
          <form onSubmit={handleCreateEntity} className="entity-form">
            <div className="form-group">
              <label>Entity Type</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="dv-select-input"
              >
                <option value="VEHICLE">Vehicle (Car, Motorcycle, Scooter)</option>
                <option value="PERSON">Person (Family Member, Self)</option>
                <option value="PROPERTY">Property (Home, Apartment, Land)</option>
                <option value="PRODUCT">Product / Appliance (AC, Laptop, TV)</option>
                <option value="INSURANCE_POLICY">Insurance Policy</option>
                <option value="ORGANISATION">Organisation / Issuer</option>
                <option value="OTHER">Other Entity</option>
              </select>
            </div>

            <div className="form-group">
              <label>Entity Name / Title</label>
              <input
                type="text"
                placeholder="e.g. Honda City ZX, Dad, Pune Flat, Daikin Split AC"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="dv-text-input"
              />
            </div>

            {formType === 'VEHICLE' && (
              <div className="form-group">
                <label>Registration Number (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. DL01AB1234"
                  value={formIdentifier}
                  onChange={(e) => setFormIdentifier(e.target.value)}
                  className="dv-text-input font-mono"
                />
              </div>
            )}

            {formType === 'PERSON' && (
              <div className="form-group">
                <label>Family Role / Relationship (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Father, Mother, Spouse, Self"
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="dv-text-input"
                />
              </div>
            )}

            <div className="modal-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Adding...' : 'Add to Graph'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
