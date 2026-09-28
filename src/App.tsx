import { useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";
import { initialLicenses } from "./demo/data";
import { clearAccessToken, getAccessToken, setAccessToken } from "./api/auth";
import "./App.css";

/**
 * 演示登录用的占位 token。
 *
 * 登录接口还没实现（开发优先级第 5 项），演示登录先放一个占位值，让
 * 「**登录态 = 有 token**」这条判断从今天就成立：否则网络层 401 清掉 token 之后，
 * 路由仍认为已登录，会出现「跳登录页 → 被弹回后台 → 再 401」的来回跳。
 */
const DEMO_ACCESS_TOKEN = "demo-access-token";

export default function App() {
  const [signedIn, setSignedIn] = useState(() => getAccessToken() !== null);
  const [licenses, setLicenses] = useState(initialLicenses);
  function changeSession(value: boolean) {
    if (value) setAccessToken(DEMO_ACCESS_TOKEN);
    else clearAccessToken();
    setSignedIn(value);
  }
  return (
    <BrowserRouter>
      <AppRoutes
        signedIn={signedIn}
        onSessionChange={changeSession}
        licenses={licenses}
        onLicensesChange={setLicenses}
      />
    </BrowserRouter>
  );
}
