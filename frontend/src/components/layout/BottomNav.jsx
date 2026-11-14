import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Home, 
  Files, 
  UploadCloud, 
  Sparkles,
  Calendar, 
  Menu
} from 'lucide-react';
import './BottomNav.css';

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Mobile Navigation">
      <NavLink 
        to="/dashboard" 
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        end
      >
        <Home size={20} className="nav-icon" />
        <span className="nav-label">Home</span>
      </NavLink>

      <NavLink 
        to="/documents" 
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
      >
        <Files size={20} className="nav-icon" />
        <span className="nav-label">Vault</span>
      </NavLink>

      {/* Prominent Native App Upload & Scan Action FAB */}
      <NavLink 
        to="/upload" 
        className={({ isActive }) => `nav-item nav-item-upload ${isActive ? 'active' : ''}`}
        aria-label="Upload or Scan Document"
      >
        <div className="upload-icon-circle">
          <UploadCloud size={20} color="#FFFFFF" />
        </div>
        <span className="nav-label">Upload</span>
      </NavLink>

      {/* Ask AI Copilot Option */}
      <NavLink 
        to="/ask-ai" 
        className={({ isActive }) => `nav-item nav-item-ask ${isActive ? 'active' : ''}`}
      >
        <Sparkles size={20} className="nav-icon nav-icon-ask" />
        <span className="nav-label">Ask AI</span>
      </NavLink>

      <NavLink 
        to="/deadlines" 
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
      >
        <Calendar size={20} className="nav-icon" />
        <span className="nav-label">Alerts</span>
      </NavLink>

      <NavLink 
        to="/more" 
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
      >
        <Menu size={20} className="nav-icon" />
        <span className="nav-label">More</span>
      </NavLink>
    </nav>
  );
}
