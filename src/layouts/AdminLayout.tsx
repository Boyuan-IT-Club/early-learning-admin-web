import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Brand, Icon } from "../components/ui";
import type { IconName } from "../components/ui";
const links: { path: string; label: string; icon: IconName; group: string }[] =
  [
    { path: "/licenses", label: "激活码管理", icon: "key", group: "账号管理" },
    { path: "/teachers", label: "教师账号", icon: "users", group: "账号管理" },
    {
      path: "/content/courses",
      label: "课程材料",
      icon: "book",
      group: "内容管理",
    },
    {
      path: "/content/assessments",
      label: "评估材料",
      icon: "clipboard",
      group: "内容管理",
    },
    {
      path: "/content/dictionaries",
      label: "字典材料",
      icon: "dictionary",
      group: "内容管理",
    },
    { path: "/api-usage", label: "API 用量", icon: "usage", group: "使用情况" },
  ];
export function AdminLayout({ onLogout }: { onLogout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const current = links.find((link) => link.path === location.pathname);
  return (
    <div className="app-shell">
      {menuOpen && (
        <button
          className="sidebar-overlay"
          aria-label="关闭导航"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        id="main-navigation"
        className={`sidebar ${menuOpen ? "is-open" : ""}`}
      >
        <Brand />
        <nav aria-label="主导航">
          {["账号管理", "内容管理", "使用情况"].map((group) => (
            <div className="nav-group" key={group}>
              <p>{group}</p>
              {links
                .filter((link) => link.group === group)
                .map((link) => (
                  <NavLink
                    key={link.path}
                    to={link.path}
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon name={link.icon} />
                    <span>{link.label}</span>
                    <span className="nav-active-dot" />
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-note">
          <Icon name="leaf" size={24} />
          <p>让成长，被看见。</p>
          <span>每一份支持，都有意义。</span>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">管</span>
          <div>
            <strong>演示管理员</strong>
            <small>管理工作台</small>
          </div>
          <button
            className="icon-button"
            aria-label="退出登录"
            title="退出登录"
            onClick={onLogout}
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              aria-expanded={menuOpen}
              aria-controls="main-navigation"
              onClick={() => setMenuOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <span>管理工作台</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{current?.label ?? "页面未找到"}</strong>
          </div>
          <span className="demo-pill">
            <i />
            演示模式
          </span>
        </header>
        <main id="main-content">
          <Outlet />
        </main>
        <footer className="workspace-footer">
          <span>初芽 · 为每一次成长提供支持</span>
          <span>示例数据，仅供界面体验</span>
        </footer>
      </div>
    </div>
  );
}
