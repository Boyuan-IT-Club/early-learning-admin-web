import { useState } from "react";
import type { FormEvent } from "react";
import { login } from "../api/auth";
import { ErrorNotice } from "../components/ErrorNotice";
import { Brand, Icon } from "../components/ui";

/**
 * 管理员登录。账号密码错误与账号不存在回同一个错误码（服务端防探测），这里也只说"不正确"。
 */
export function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await login(username.trim(), password);
      onLogin();
    } catch (error) {
      setFailure(error);
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-story">
        <Brand />
        <div className="login-intro">
          <span className="eyebrow">A LITTLE SUPPORT. A BIG DIFFERENCE.</span>
          <h1>
            守护小小的芽，
            <br />
            看见大大的成长。
          </h1>
          <p>
            连接教师与资源，让每一次用心的干预，
            <br />
            都有更好的开始。
          </p>
          <div className="growth-art" aria-hidden="true">
            <div className="art-ring ring-one" />
            <div className="art-ring ring-two" />
            <div className="stem" />
            <div className="leaf-shape leaf-left" />
            <div className="leaf-shape leaf-right" />
            <div className="art-sun" />
            <span className="art-dot dot-one" />
            <span className="art-dot dot-two" />
            <div className="art-caption">
              <Icon name="leaf" size={17} />
              一点支持，无限可能
            </div>
          </div>
        </div>
        <small>早期困难儿童筛查与干预系统</small>
      </section>
      <section className="login-form-panel">
        <form onSubmit={submit} className="login-form">
          <span className="eyebrow">WELCOME BACK</span>
          <h2>欢迎来到初芽</h2>
          <p>登录管理工作台，开始今天的支持。</p>
          <label>
            管理员账号
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label>
            密码
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <ErrorNotice error={failure} />
          <button
            className="button primary login-submit"
            disabled={!username.trim() || !password || submitting}
          >
            {submitting ? "登录中…" : "登录"}
            <Icon name="arrow" size={18} />
          </button>
        </form>
        <span className="login-footnote">简单管理，用心支持。</span>
      </section>
    </div>
  );
}
