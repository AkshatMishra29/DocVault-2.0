import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  Home, 
  Files, 
  Sparkles,
  Calendar, 
  Menu,
  ChevronUp,
  Camera,
  FileUp,
  Image as ImageIcon,
  X,
  ShieldCheck,
  Plus
} from 'lucide-react';
import './BottomNav.css';

export default function BottomNav() {
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [touchStartY, setTouchStartY] = useState(null);
  const [touchCurrentY, setTouchCurrentY] = useState(null);
  const [sheetDragStartY, setSheetDragStartY] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Close sheet on route change
  useEffect(() => {
    setShowAddSheet(false);
  }, [location.pathname]);

  // Prevent background scroll when sheet is open
  useEffect(() => {
    if (showAddSheet) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showAddSheet]);

  // ── Swipe-up detection on the Bottom Navigation Bar ────────────────
  const handleNavTouchStart = (e) => {
    setTouchStartY(e.touches[0].clientY);
    setTouchCurrentY(e.touches[0].clientY);
  };

  const handleNavTouchMove = (e) => {
    setTouchCurrentY(e.touches[0].clientY);
    if (touchStartY !== null) {
      const delta = touchStartY - e.touches[0].clientY;
      // If user swiped upwards by more than 35px, trigger the Add Document sheet
      if (delta > 35) {
        setShowAddSheet(true);
        setTouchStartY(null);
        setTouchCurrentY(null);
      }
    }
  };

  const handleNavTouchEnd = () => {
    setTouchStartY(null);
    setTouchCurrentY(null);
  };

  // ── Swipe-down to dismiss sheet ───────────────────────────────────
  const handleSheetTouchStart = (e) => {
    setSheetDragStartY(e.touches[0].clientY);
  };

  const handleSheetTouchEnd = (e) => {
    if (sheetDragStartY !== null) {
      const delta = e.changedTouches[0].clientY - sheetDragStartY;
      if (delta > 50) {
        setShowAddSheet(false);
      }
      setSheetDragStartY(null);
    }
  };

  const handleNavigateAction = (path, state = {}) => {
    setShowAddSheet(false);
    navigate(path, { state });
  };

  return (
    <div className="bottom-nav-container">
      <div 
        className="bottom-nav-wrapper"
        onTouchStart={handleNavTouchStart}
        onTouchMove={handleNavTouchMove}
        onTouchEnd={handleNavTouchEnd}
      >
        {/* ── Swipe Up Handle / Indicator Pill ──────────────────────── */}
        <button
          type="button"
          className="bottom-nav-swipe-pill"
          onClick={() => setShowAddSheet(true)}
          aria-label="Swipe up to add document to vault"
          title="Swipe up or tap to add document"
        >
          <ChevronUp size={14} className="swipe-chevron" />
          <span className="swipe-text">Swipe up to Add Document</span>
        </button>

        {/* ── 5-Item Bottom Navigation Bar ─────────────────────────── */}
        <nav className="bottom-nav" aria-label="Main Navigation">
          {/* 1. Home */}
          <NavLink 
            to="/dashboard" 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            end
          >
            <Home size={20} className="nav-icon" />
            <span className="nav-label">Home</span>
          </NavLink>

          {/* 2. Vault / Documents */}
          <NavLink 
            to="/documents" 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Files size={20} className="nav-icon" />
            <span className="nav-label">Vault</span>
          </NavLink>

          {/* 3. Copilot — PROMINENT CENTERPIECE */}
          <NavLink 
            to="/copilot" 
            className={({ isActive }) => `nav-item nav-item-ai ${isActive ? 'active' : ''}`}
            aria-label="DocVault Copilot"
          >
            <div className="ai-icon-bubble">
              <Sparkles size={21} className="ai-sparkle-icon" />
            </div>
            <span className="nav-label ai-label">Copilot</span>
          </NavLink>

          {/* 4. Alerts / Deadlines */}
          <NavLink 
            to="/deadlines" 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Calendar size={20} className="nav-icon" />
            <span className="nav-label">Alerts</span>
          </NavLink>

          {/* 5. More / Settings */}
          <NavLink 
            to="/more" 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Menu size={20} className="nav-icon" />
            <span className="nav-label">More</span>
          </NavLink>
        </nav>
      </div>

      {/* ── Native-Style "Add to Vault" Action Drawer / Sheet ──────── */}
      {showAddSheet && (
        <>
          <div 
            className="sheet-backdrop"
            onClick={() => setShowAddSheet(false)}
            aria-hidden="true"
          />

          <div 
            className="sheet-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Add Document to Vault"
            onTouchStart={handleSheetTouchStart}
            onTouchEnd={handleSheetTouchEnd}
          >
            <div className="sheet-handle-bar">
              <div className="sheet-handle" />
            </div>

            <div className="sheet-header">
              <div className="sheet-header-title-box">
                <div className="sheet-header-badge">
                  <Plus size={14} />
                </div>
                <div>
                  <h3 className="sheet-title">Add to Your Vault</h3>
                  <p className="sheet-subtitle">Instant OCR extraction & military-grade encryption</p>
                </div>
              </div>
              <button 
                type="button" 
                className="sheet-close-btn"
                onClick={() => setShowAddSheet(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="sheet-actions-grid">
              {/* Option 1: Upload File */}
              <button
                type="button"
                className="sheet-action-card"
                onClick={() => handleNavigateAction('/upload', { mode: 'file' })}
              >
                <div className="sheet-action-icon sheet-action-icon--blue">
                  <FileUp size={22} color="#0070F2" />
                </div>
                <div className="sheet-action-content">
                  <span className="sheet-action-title">Upload File</span>
                  <span className="sheet-action-desc">PDF, PNG, JPG, or Receipts</span>
                </div>
              </button>

              {/* Option 2: Camera Scan */}
              <button
                type="button"
                className="sheet-action-card"
                onClick={() => handleNavigateAction('/upload', { mode: 'camera' })}
              >
                <div className="sheet-action-icon sheet-action-icon--violet">
                  <Camera size={22} color="#8B5CF6" />
                </div>
                <div className="sheet-action-content">
                  <span className="sheet-action-title">Scan with Camera</span>
                  <span className="sheet-action-desc">Snap documents or warranties directly</span>
                </div>
              </button>

              {/* Option 3: Photo Gallery */}
              <button
                type="button"
                className="sheet-action-card"
                onClick={() => handleNavigateAction('/upload', { mode: 'gallery' })}
              >
                <div className="sheet-action-icon sheet-action-icon--emerald">
                  <ImageIcon size={22} color="#10B981" />
                </div>
                <div className="sheet-action-content">
                  <span className="sheet-action-title">Photo Library</span>
                  <span className="sheet-action-desc">Select existing photos & snapshots</span>
                </div>
              </button>
            </div>

            <div className="sheet-privacy-note">
              <ShieldCheck size={14} color="#10B981" />
              <span>AES-256 encrypted on arrival. AI extraction runs with zero third-party storage.</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
