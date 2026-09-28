# 管理端前端镜像：构建与运行分阶段，运行阶段只有 nginx + 静态文件。
#
# ⚠️ Vite 的 import.meta.env.VITE_* 是**构建期**静态替换，不是运行时读取。
# 因此这里默认烘焙空值 —— 空 baseURL 让 axios 走页面同源，
# 由 nginx.conf 把 /api 与 /admin 转给后端。好处是同一个镜像可以部署到任何环境：
# 换环境改的是 nginx 的 proxy_pass，不用重新构建前端。
# 如果哪天要烘焙绝对地址，就必须按环境分别构建，那等于放弃「一份产物跑所有环境」。

FROM node:22-bookworm-slim AS build

WORKDIR /web
# 先装依赖再复制源码：依赖层只在 package-lock.json 变化时失效。
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
# npm run build = tsc -b && vite build：类型错误会让构建失败，这是有意保留的质量闸门。
RUN npm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /web/dist /usr/share/nginx/html
EXPOSE 80
