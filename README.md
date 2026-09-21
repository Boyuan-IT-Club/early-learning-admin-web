# 初芽 · 管理工作台

早期困难儿童筛查与干预系统的 Web 管理端，使用 React、TypeScript 和 Vite。

当前为 UI 演示，包含登录、激活码、教师账号、课程 / 评估 / 字典材料上传和 API 用量页面。使用本地示例数据，无需启动后端。

## 本地开发

在项目根目录执行：

```bash
# 安装锁定版本的依赖（首次运行）
npm ci

# 启动开发服务器
npm run dev
```

打开终端显示的地址（默认 http://localhost:5173），点击「进入演示后台」即可体验。停止服务按 `Ctrl+C`。

## 常用命令

| 命令                                 | 说明                                 |
| ------------------------------------ | ------------------------------------ |
| `npm run dev`                        | 启动开发服务器，支持热更新           |
| `npm run build`                      | 执行 TypeScript 检查并构建到 `dist/` |
| `npm run preview`                    | 本地预览构建产物，需先执行构建       |
| `npm run lint`                       | 执行 ESLint 检查                     |
| `npm test`                           | 执行全部 Vitest 测试并退出           |
| `npx vitest`                         | 监听文件变化，持续运行测试           |
| `npx tsc -b`                         | 单独执行 TypeScript 检查             |
| `npx prettier --check src README.md` | 检查源码和 README 格式               |
| `npx prettier --write src README.md` | 格式化源码和 README                  |

提交前执行：

```bash
npm run build
npm run lint
npm test
```

## 演示说明

登录信息、激活码和上传结果均为演示，不会验证真实凭据或上传文件。具体操作与后续接口接入边界见 [UI 演示说明](docs/UI演示.md)。

## 目录说明

下面按当前实际使用的文件组织列出，新功能优先沿用此结构：

```text
early-learning-admin-web/
├─ docs/
│  ├─ UI演示.md              # 演示操作、限制和接口接入边界
│  ├─ 技术方案.md            # 系统技术方案与数据设计（包含教师端内容）
│  └─ 参考资料.md            # 飞书文档入口
├─ public/                  # 通过绝对 URL 引用的静态资源，如 /sprout.svg
├─ src/
│  ├─ api/
│  │  ├─ client.ts          # 唯一 Axios 实例、请求基础配置
│  │  ├─ auth.ts            # 管理员认证接口（待实现）
│  │  ├─ licenses.ts        # 激活码接口（待实现）
│  │  ├─ teachers.ts        # 教师账号接口（待实现）
│  │  ├─ courses.ts         # 课程材料接口（待实现）
│  │  ├─ assessments.ts     # 评估材料接口（待实现）
│  │  ├─ dictionaries.ts   # 字典材料接口（待实现）
│  │  └─ usage.ts           # API 用量接口（待实现）
│  ├─ components/
│  │  ├─ ui.tsx            # 图标、标题、状态标签、搜索框、空状态、弹窗等
│  │  └─ FileUpload.tsx    # 三类材料共用的文件选择与模拟上传组件
│  ├─ demo/
│  │  └─ data.ts           # 示例数据、演示展示类型和材料页面文案
│  ├─ layouts/
│  │  └─ AdminLayout.tsx   # 后台外壳、导航、顶部栏和退出入口
│  ├─ pages/
│  │  ├─ Login.tsx         # 演示登录
│  │  ├─ Licenses.tsx      # 激活码列表、筛选与示例生成
│  │  ├─ Teachers.tsx      # 教师列表与用量跳转
│  │  ├─ Content.tsx       # 课程 / 评估 / 字典共用页面
│  │  └─ ApiUsage.tsx      # API 用量列表与筛选
│  ├─ router/
│  │  └─ index.tsx         # 路由注册、演示登录守卫、默认跳转与 404
│  ├─ types/              # 预留：跨模块共享类型，当前为空
│  ├─ utils/              # 预留：通用纯函数，当前为空
│  ├─ App.tsx             # 应用入口组件、演示登录态和激活码状态
│  ├─ App.test.tsx        # 关键页面交互测试
│  ├─ App.css             # 布局、页面、组件样式及响应式适配
│  ├─ index.css           # 基础样式、全局颜色变量与通用元素规则
│  └─ main.tsx            # React 挂载入口
├─ AGENTS.md              # 项目范围、前后端职责和仓库开发约束
├─ index.html             # HTML 入口、页面标题与站点图标
├─ package.json           # 依赖和开发命令
├─ package-lock.json      # npm 依赖锁文件
├─ vite.config.ts         # Vite 配置
├─ tsconfig*.json         # TypeScript 配置
├─ eslint.config.js       # ESLint 配置
└─ prettier.config.js     # Prettier 配置
```

仓库还保留了初始化时创建的空目录，如 `pages/Login/`、`pages/Courses/`、`components/FileUpload/`、`components/DataTable/` 和 `components/Loading/`。它们不是当前实现入口；修改功能时以已有 `.tsx` 文件及实际 import 为准，避免在同名目录里另写一套实现。页面变复杂时，再统一迁移为目录结构并更新引用。

`node_modules/` 是依赖安装目录，`dist/` 是构建产物，不在其中维护业务源码。

## 页面与路由

| 路由                    | 页面文件                 | 说明                          |
| ----------------------- | ------------------------ | ----------------------------- |
| `/login`                | `src/pages/Login.tsx`    | 独立登录页                    |
| `/licenses`             | `src/pages/Licenses.tsx` | 登录后的默认页                |
| `/teachers`             | `src/pages/Teachers.tsx` | 教师账号                      |
| `/content/courses`      | `src/pages/Content.tsx`  | `kind="courses"`              |
| `/content/assessments`  | `src/pages/Content.tsx`  | `kind="assessments"`          |
| `/content/dictionaries` | `src/pages/Content.tsx`  | `kind="dictionaries"`         |
| `/api-usage`            | `src/pages/ApiUsage.tsx` | 可用 `?teacher=账号` 预选教师 |

除登录页外，以上页面共用 `AdminLayout`。新增页面时，在 `src/router/index.tsx` 注册路由；需要导航入口时，同步修改 `src/layouts/AdminLayout.tsx` 的导航配置。

## 开发约定

### 代码放在哪里

- **页面与状态**：页面放在 `src/pages/`，组件文件采用 PascalCase，例如 `Teachers.tsx`。只属于当前页面的表单、筛选等状态留在页面内；确有跨页面需求时再提升状态。优先使用 React 自带能力，不预先引入全局状态库。
- **公共组件**：多个页面共用的 UI 放在 `src/components/`。先检查 `ui.tsx` 和 `FileUpload.tsx` 是否可复用；单个页面的专用组件可先留在页面文件内，复杂后再就近拆分。
- **请求封装**：业务请求按模块放在 `src/api/`，统一复用 `client.ts` 的 `apiClient`。页面不创建 Axios 实例，也不散落直接的 HTTP 请求。
- **类型**：组件 Props、单模块类型就近定义；确实跨模块共享的类型放到 `src/types/`。显式定义请求、响应和状态类型，避免大量使用 `any`，纯类型导入使用 `import type`。
- **工具函数**：可复用、与页面展示无关的纯函数放在 `src/utils/`；接口请求仍放 `api/`。不要把所有业务逻辑集中进一个工具文件。
- **示例数据**：演示数据集中放 `src/demo/`，不在多个页面重复硬编码。这里的类型和数值不代表正式接口或业务规则。
- **样式与资源**：基础样式、颜色变量放 `index.css`；当前页面和组件样式放 `App.css`，沿用已有按钮、表格和状态样式。需由代码 import 的图片可按需建立 `src/assets/`；直接通过 URL 使用的资源放 `public/`。
- **测试与文档**：测试使用 `*.test.ts` / `*.test.tsx`，优先与被测模块就近放置；跨页面流程可参考 `App.test.tsx`。功能使用说明放 `docs/`，启动方式或目录职责变化时同步更新 README。

### 接口与演示数据

当前业务 API 文件仍为空，接口路径、字段、分页、认证和上传限制尚未正式对齐。不要根据示例数据推定接口契约，也不要将教师端接口或认证流程直接套到管理端。

接入真实服务时，先确认契约，再在对应 API 文件实现请求，最后替换页面中的示例数据与模拟行为。登录态、鉴权失败处理和上传结果应以服务端返回为准；当前 `sessionStorage` 演示标记不能作为正式认证。

API 基础地址由 `src/api/client.ts` 读取 `VITE_API_BASE_URL`。本地配置可放在已被 Git 忽略的 `.env.local` 中，例如：

```env
VITE_API_BASE_URL=http://localhost:8080/api
```

此地址仅为示例，以后端部署配置为准。环境变量修改后重启开发服务；`VITE_` 变量会进入客户端代码，不存放服务端密钥。当前仓库的 `.env.develoment` 文件名有拼写缺失，不能作为默认开发模式配置自动加载；开发模式标准文件名为 `.env.development`。

### 前后端职责

前端负责展示、表单、路由、登录态、请求、文件选择、基础类型 / 大小校验，以及加载、空数据和错误状态。

材料解压与完整解析、Schema 与跨文件引用校验、编码冲突判断、OSS / 数据库写入、导入事务及补偿、激活码生成规则、API 用量统计逻辑均由后端负责。课程、评估和字典继续共用上传流程，不在前端实现资源解析引擎。

上传时区分“传输中”和“后端处理中”，不能把传输进度 100% 当作导入成功。错误尽量完整展示后端返回的 `code`、`path`、`message`，不要自行推断业务原因。

### 协作与提交

1. 开始前阅读相关页面、API、类型及 [AGENTS.md](AGENTS.md)，确认需求属于管理端。飞书与技术方案包含教师端内容，不代表本仓库需要实现全部功能；范围或规则冲突先对齐。
2. 复用现有组件和请求封装，只改当前需求相关代码。保持轻量结构，不为假设需求引入大型依赖、复杂分层、权限系统或 Dashboard。
3. 新增交互覆盖必要的加载、错误、空状态与重复提交处理，保持按钮可访问名称、键盘操作和窄屏适配。
4. 为关键行为变更补充有价值的测试，如登录跳转、筛选、上传校验和错误反馈；遵循 ESLint / Prettier 配置，不靠关闭规则绕过问题。
5. 提交前通过上方 TypeScript / 构建、ESLint 和测试命令。依赖变更同步更新 `package.json` 与 `package-lock.json`，不提交密钥、真实用户数据或构建产物。

完整项目边界见 [AGENTS.md](AGENTS.md)，业务资料见 [技术方案](docs/技术方案.md) 和 [飞书参考资料](docs/参考资料.md)。
