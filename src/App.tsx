import { useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";
import { getAccessToken, logout } from "./api/auth";
import "./App.css";

/**
 * 登录态 = 会话里有管理员 Token。
 *
 * Token 失效（过期、被吊销、管理员被停用）时，网络层清掉它并整页跳回登录页，
 * 重新挂载后这里读到"没有 Token"，路由自然落在登录页，不会来回跳。
 */
export default function App() {
  const [signedIn, setSignedIn] = useState(() => getAccessToken() !== null);

  function signOut() {
    logout();
    setSignedIn(false);
  }

  return (
    <BrowserRouter>
      <AppRoutes signedIn={signedIn} onLogin={() => setSignedIn(true)} onLogout={signOut} />
    </BrowserRouter>
  );
}
