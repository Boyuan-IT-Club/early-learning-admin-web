import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "../layouts/AdminLayout";
import { Login } from "../pages/Login";
import { AiScore } from "../pages/ai-score";
import { Files } from "../pages/Files";
import { Materials } from "../pages/Materials";
import { Licenses } from "../pages/Licenses";
import { Teachers } from "../pages/Teachers";
import { Admins } from "../pages/Admins";

interface Props {
  signedIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
}

const HOME = "/licenses";

export function AppRoutes({ signedIn, onLogin, onLogout }: Props) {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          signedIn ? (
            <Navigate to={HOME} replace />
          ) : (
            <Login onLogin={onLogin} />
          )
        }
      />
      <Route
        element={
          signedIn ? (
            <AdminLayout onLogout={onLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      >
        <Route index element={<Navigate to={HOME} replace />} />
        <Route path="/licenses" element={<Licenses />} />
        <Route path="/teachers" element={<Teachers />} />
        <Route path="/admins" element={<Admins onSessionEnded={onLogout} />} />
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
              <a className="button primary" href={HOME}>
                返回激活码管理
              </a>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}
