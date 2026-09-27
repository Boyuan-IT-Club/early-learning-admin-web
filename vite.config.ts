import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 开发期把 /api 与 /admin 代理到后端，与生产 nginx 的 `location ~ ^/(api|admin)/` 保持一致。
// 这样前端用相对路径请求即可（同源），不需要构建期 API 地址，也不需要后端开 CORS。
const target = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target, changeOrigin: true },
      '/admin': { target, changeOrigin: true },
    },
  },
})
