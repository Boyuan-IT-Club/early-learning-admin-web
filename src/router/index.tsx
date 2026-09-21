import { Navigate, Route, Routes } from "react-router-dom";
import type { Dispatch, SetStateAction } from "react";
import type { License } from "../demo/data";
import { AdminLayout } from "../layouts/AdminLayout";
import { Login } from "../pages/Login";
import { Licenses } from "../pages/Licenses";
import { Teachers } from "../pages/Teachers";
import { ApiUsage } from "../pages/ApiUsage";
import { Content } from "../pages/Content";
interface Props {
  signedIn: boolean;
  onSessionChange: (value: boolean) => void;
  licenses: License[];
  onLicensesChange: Dispatch<SetStateAction<License[]>>;
}
export function AppRoutes({
  signedIn,
  onSessionChange,
  licenses,
  onLicensesChange,
}: Props) {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          signedIn ? (
            <Navigate to="/licenses" replace />
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
        <Route index element={<Navigate to="/licenses" replace />} />
        <Route
          path="/licenses"
          element={<Licenses licenses={licenses} onChange={onLicensesChange} />}
        />
        <Route path="/teachers" element={<Teachers />} />
        <Route
          path="/content/courses"
          element={<Content key="courses" kind="courses" />}
        />
        <Route
          path="/content/assessments"
          element={<Content key="assessments" kind="assessments" />}
        />
        <Route
          path="/content/dictionaries"
          element={<Content key="dictionaries" kind="dictionaries" />}
        />
        <Route path="/api-usage" element={<ApiUsage />} />
        <Route
          path="*"
          element={
            <div className="not-found">
              <span className="eyebrow">404</span>
              <h1>这片叶子飘远了</h1>
              <p>请从左侧导航选择一个页面。</p>
              <a className="button primary" href="/licenses">
                返回激活码管理
              </a>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}
