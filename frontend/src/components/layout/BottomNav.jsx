import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Home, 
  Files, 
  Sparkles, 
  Boxes, 
  Menu
} from 'lucide-react';
import './BottomNav.css';

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      <NavLink 
        to="/dashboard" 
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        end
      >
        <Home size={22} className="nav-icon" />
        <span className="nav-label">Home</span>
      </NavLink>

      <NavLink 
        to="/documents" 
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
      >
        <Files size={22} className="nav-icon" />
        <span className="nav-label">Docs</span>
      </NavLink>

      <NavLink 
        to="/ask-ai" 
        className={({ isActive }) => `nav-item nav-item-ai ${isActive ? 'active' : ''}`}
      >
        <div className="ai-icon-circle">
          <Sparkles size={20} color="#fff" />
        </div>
        <span className="nav-label">Ask AI</span>
      </NavLink>

      <NavLink 
        to="/assets" 
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
      >
        <Boxes size={22} className="nav-icon" />
        <span className="nav-label">Assets</span>
      </NavLink>

      <NavLink 
        to="/more" 
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
      >
        <Menu size={22} className="nav-icon" />
        <span className="nav-label">More</span>
      </NavLink>
    </nav>
  );
}
