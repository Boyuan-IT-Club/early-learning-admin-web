# AGENTS.md

## 1. 项目定位

本仓库为 **早期困难儿童筛查与干预系统的管理端前端**。

当前管理端功能较轻，主要承担管理员侧的基础管理与资源上传，不承载复杂业务逻辑。

技术栈：

* React
* TypeScript
* Vite
* React Router
* Axios
* Vitest
* ESLint
* Prettier

本项目为纯 Web 管理后台，不包含 Capacitor、SQLite、本地文件系统等移动端能力。

---

## 2. 当前核心功能

初版管理端仅实现以下功能：

### 2.1 管理员登录

* 管理员账号登录
* 登录态维护
* 未登录用户禁止访问后台页面
* 登录后进入统一后台布局

---

### 2.2 激活码管理

管理员可以：

* 生成教师激活码
* 查看激活码列表
* 查看激活码状态
* 查看激活码是否已绑定教师账号

激活码的生成、绑定状态维护等实际业务逻辑由后端负责。

---

### 2.3 教师账号管理

管理员可以：

* 查看教师账号列表
* 查看教师账号基本信息
* 查看账号激活状态
* 查看每个教师账号的 API 调用量统计

初版不要求复杂用户运营、权限配置或行为分析。

---

### 2.4 内容管理

管理端用于上传三类内容：

* 课程材料
* 评估材料
* 字典材料

对应页面建议：

```text
/content/courses
/content/assessments
/content/dictionaries
```

管理端前端主要负责：

* 文件选择
* 基础文件类型/大小校验
* 发起上传请求
* 展示上传进度
* 展示解析结果
* 展示后端返回的错误信息

前端 **不得承担完整资源解析业务**。

---

### 2.5 API 调用量统计

管理员可以查看每个教师账号的 API 使用情况。

初版以简单表格为主，不要求复杂 Dashboard。

可包含：

* 教师账号
* API 类型
* 调用次数
* 使用量
* 最近调用时间

具体统计规则由后端定义，前端仅展示后端返回结果。

---

## 3. 系统边界

### 3.1 前端负责

管理端前端负责：

* 页面展示
* 表单输入
* 路由
* 登录态处理
* API 调用
* 文件选择与上传
* 基础客户端校验
* Loading / Error / Empty 状态
* 后端错误信息展示

---

### 3.2 前端不负责

以下能力不得在 React 前端实现：

* 课程 JSON 的完整业务解析
* 评估 JSON 的完整业务解析
* 字典内容解析
* JSON Schema 的完整业务校验
* 跨文件引用校验
* `file_code` 唯一性校验
* `course_code` 冲突判断
* OSS 对象存储写入
* MySQL 数据写入
* OSS 与数据库映射维护
* 导入事务控制
* 导入失败后的补偿删除
* API 用量统计逻辑

以上均属于 Spring Boot 后端职责。

---

## 4. 资源上传原则

课程、评估和字典的上传，本质上属于统一的资源导入流程。

整体流程为：

```text
前端选择文件
    ↓
前端基础校验
    ↓
上传至后端
    ↓
后端解压 / 解析
    ↓
Schema 校验
    ↓
业务规则校验
    ↓
文件引用与完整性校验
    ↓
OSS 上传
    ↓
数据库写入
    ↓
返回导入结果
    ↓
前端展示结果
```

前端不关心内部解析细节。

---

## 5. 错误处理要求

资源上传失败时，后端应返回结构化错误。

前端只负责展示，不自行推断业务错误。

示例：

```json
{
  "success": false,
  "errors": [
    {
      "code": "RESOURCE_NOT_FOUND",
      "path": "activities[2].image_file_code",
      "message": "引用的文件 img_003 不存在"
    }
  ]
}
```

前端应尽量直接展示：

* 错误类型
* 出错位置
* 错误说明

不要只显示：

```text
上传失败
```

---

## 6. 推荐页面结构

```text
/login

/
└─ AdminLayout
   ├─ /licenses
   ├─ /teachers
   ├─ /content/courses
   ├─ /content/assessments
   ├─ /content/dictionaries
   └─ /api-usage
```

后台导航建议：

```text
管理后台

├─ 激活码管理
├─ 教师账号
├─ 内容管理
│  ├─ 课程
│  ├─ 评估
│  └─ 字典
└─ API 用量
```

---

## 7. 推荐目录结构

```text
src/
├─ api/
│  ├─ client.ts
│  ├─ auth.ts
│  ├─ licenses.ts
│  ├─ teachers.ts
│  ├─ courses.ts
│  ├─ assessments.ts
│  ├─ dictionaries.ts
│  └─ usage.ts
│
├─ components/
│  ├─ DataTable/
│  ├─ FileUpload/
│  └─ Loading/
│
├─ layouts/
│  └─ AdminLayout.tsx
│
├─ pages/
│  ├─ Login/
│  ├─ Licenses/
│  ├─ Teachers/
│  ├─ Courses/
│  ├─ Assessments/
│  ├─ Dictionaries/
│  └─ ApiUsage/
│
├─ router/
│  └─ index.tsx
│
├─ types/
├─ utils/
│
├─ App.tsx
└─ main.tsx
```

目录可以根据实际开发适当调整，但不要为了形式引入过度复杂的分层。

---

## 8. 前端架构原则

当前管理端是轻量后台，不需要复杂前端架构。

原则：

* 优先保持简单
* 不做过度抽象
* 不引入复杂 DDD 分层
* 不为未来假设需求提前设计复杂系统
* 页面状态优先使用 React 自带能力
* 只有明确需要时才引入额外状态管理库

当前不要求 Redux、Zustand 等全局状态管理方案。

如果后续确实出现跨页面复杂状态，再决定是否引入。

---

## 9. API 访问约定

所有 HTTP 请求统一通过：

```text
src/api/client.ts
```

不要在页面中直接创建新的 Axios 实例。

示例：

```ts
import axios from 'axios'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
})
```

环境变量示例：

```env
VITE_API_BASE_URL=http://localhost:8080/api
```

具体接口路径以正式后端接口文档为准。

---

## 10. 开发原则

开发新功能前，先确认：

1. 该逻辑是否真的属于前端
2. 是否已有可复用 API 封装
3. 是否已有公共组件
4. 是否会重复实现后端业务逻辑

禁止为了“方便”将后端业务规则复制到前端。

---

## 11. Codex 开发约束

Codex 修改本仓库时应遵守以下规则：

* 修改前先阅读相关页面、API 和类型定义
* 优先沿用现有项目结构
* 不随意引入大型依赖
* 不修改与当前任务无关的代码
* 不自行创造新的业务规则
* 不擅自改变前后端职责边界
* 不把资源解析逻辑搬到前端
* 不自行修改后端接口契约
* 类型尽量显式定义，避免大量 `any`
* 公共逻辑优先复用，不复制粘贴
* 提交前确保 TypeScript、ESLint 和测试通过

如需求与现有技术方案冲突，应先指出冲突，不要直接按猜测实现。

---

## 12. 当前开发优先级

建议按以下顺序推进：

```text
1. 项目初始化
2. 管理端 Layout
3. 路由
4. Axios Client
5. 登录
6. 激活码管理
7. 教师账号管理
8. 课程上传
9. 评估上传
10. 字典上传
11. API 用量统计
12. 错误状态和细节优化
```

资源上传相关页面可以共用统一的上传组件。

---

## 13. 非当前范围

除非需求文档明确新增，否则当前不要主动实现：

* 多角色复杂权限系统
* Dashboard 大屏
* 图表分析平台
* 实时 WebSocket 数据
* 前端资源解析引擎
* 前端本地数据库
* 离线模式
* 多租户复杂管理
* 内容在线编辑器
* 工作流审批系统

---

## 14. 飞书文档
见docs
