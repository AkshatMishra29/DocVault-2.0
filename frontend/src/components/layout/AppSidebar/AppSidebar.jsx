import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, UploadCloud, Layers, Calendar, Sparkles, Settings, ShieldCheck, Activity } from 'lucide-react';
import DocVaultLogo from '../../common/DocVaultLogo/DocVaultLogo';
import './AppSidebar.css';

const navItems = [
  { to: '/dashboard', label: 'Vault Overview', icon: LayoutDashboard },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/intelligence', label: 'Intelligence & Graph', icon: Activity, badge: 'DIHE' },
  { to: '/upload', label: 'Upload & OCR', icon: UploadCloud },
  { to: '/assets', label: 'Asset Registry', icon: Layers },
  { to: '/deadlines', label: 'Deadlines', icon: Calendar },
  { to: '/ask-ai', label: 'Ask AI Copilot', icon: Sparkles, badge: 'RAG' },
  { to: '/admin', label: 'Admin Console', icon: ShieldCheck, badge: 'System' },
  { to: '/more', label: 'Settings & Audit', icon: Settings },
];

export default function AppSidebar() {
  return (
    <aside className="dv-sidebar">
      <div className="dv-sidebar__header">
        <NavLink to="/dashboard">
          <DocVaultLogo height={44} />
        </NavLink>
      </div>

      <nav className="dv-sidebar__nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `dv-sidebar__item ${isActive ? 'dv-sidebar__item--active' : ''}`
              }
            >
              <Icon size={18} className="dv-sidebar__icon" />
              <span className="dv-sidebar__label">{item.label}</span>
              {item.badge && <span className="dv-sidebar__badge">{item.badge}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="dv-sidebar__footer">
        <div className="dv-sidebar__tier-pill">
          <span className="dv-sidebar__dot" />
          <span className="dv-sidebar__tier-text">Vault Pro Isolated</span>
        </div>
      </div>
    </aside>
  );
}
