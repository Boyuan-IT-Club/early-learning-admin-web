import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "../layouts/AdminLayout";
import { Login } from "../pages/Login";
import { AiScore } from "../pages/ai-score";
import { Files } from "../pages/Files";
import { Materials } from "../pages/Materials";

interface Props {
  signedIn: boolean;
  onSessionChange: (value: boolean) => void;
}

export function AppRoutes({ signedIn, onSessionChange }: Props) {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          signedIn ? (
            <Navigate to="/files" replace />
          ) : (
            <Login onLogin={() => onSessionChange(true)} />
          )
        }
      />
      <Route
        element={
          signedIn ? (
            <AdminLayout onLogout={() => onSessionChange(false)} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      >
        <Route index element={<Navigate to="/files" replace />} />
        <Route path="/files" element={<Files />} />
        <Route path="/materials" element={<Materials />} />
        <Route path="/ai-score" element={<AiScore />} />
        <Route
          path="*"
          element={
            <div className="not-found">
              <span className="eyebrow">404</span>
              <h1>这片叶子飘远了</h1>
              <p>请从左侧导航选择一个页面。</p>
              <a className="button primary" href="/files">
                返回官方素材
              </a>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}
