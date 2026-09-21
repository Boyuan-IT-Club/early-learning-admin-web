// UI fixtures only. These types describe the demo view, not a backend contract.
export interface License {
  id: string;
  code: string;
  status: "UNUSED" | "ACTIVE" | "REVOKED";
  teacher: string | null;
  createdAt: string;
}
export const initialLicenses: License[] = [
  {
    id: "1",
    code: "DEMO-2026-0001",
    status: "UNUSED",
    teacher: null,
    createdAt: "2026-09-22 09:30",
  },
  {
    id: "2",
    code: "DEMO-2026-0002",
    status: "UNUSED",
    teacher: null,
    createdAt: "2026-09-22 09:30",
  },
  {
    id: "3",
    code: "DEMO-2026-0003",
    status: "ACTIVE",
    teacher: "林晓 · linxiao",
    createdAt: "2026-09-21 14:20",
  },
  {
    id: "4",
    code: "DEMO-2026-0004",
    status: "ACTIVE",
    teacher: "陈雨 · chenyu",
    createdAt: "2026-09-21 14:20",
  },
  {
    id: "5",
    code: "DEMO-2026-0005",
    status: "ACTIVE",
    teacher: "周宁 · zhouning",
    createdAt: "2026-09-20 10:15",
  },
  {
    id: "6",
    code: "DEMO-2026-0006",
    status: "UNUSED",
    teacher: null,
    createdAt: "2026-09-20 10:15",
  },
  {
    id: "7",
    code: "DEMO-2026-0007",
    status: "REVOKED",
    teacher: null,
    createdAt: "2026-09-19 16:40",
  },
];
export const teachers = [
  {
    id: "linxiao",
    name: "林晓",
    status: "ACTIVE",
    joined: "2026-09-21",
    calls: 128,
    last: "2026-09-22 10:24",
  },
  {
    id: "chenyu",
    name: "陈雨",
    status: "ACTIVE",
    joined: "2026-09-21",
    calls: 96,
    last: "2026-09-22 09:46",
  },
  {
    id: "zhouning",
    name: "周宁",
    status: "ACTIVE",
    joined: "2026-09-20",
    calls: 64,
    last: "2026-09-21 16:32",
  },
  {
    id: "wangyue",
    name: "王悦",
    status: "INACTIVE",
    joined: "2026-09-18",
    calls: 0,
    last: "—",
  },
];
export const usage = [
  {
    teacherId: "linxiao",
    name: "林晓",
    type: "语音转写",
    calls: 48,
    amount: "126 分钟",
    last: "2026-09-22 10:24",
  },
  {
    teacherId: "linxiao",
    name: "林晓",
    type: "故事评分",
    calls: 32,
    amount: "42,800 tokens",
    last: "2026-09-22 10:20",
  },
  {
    teacherId: "linxiao",
    name: "林晓",
    type: "问答评分",
    calls: 48,
    amount: "21,600 tokens",
    last: "2026-09-22 10:18",
  },
  {
    teacherId: "chenyu",
    name: "陈雨",
    type: "语音转写",
    calls: 36,
    amount: "92 分钟",
    last: "2026-09-22 09:46",
  },
  {
    teacherId: "chenyu",
    name: "陈雨",
    type: "故事评分",
    calls: 24,
    amount: "31,200 tokens",
    last: "2026-09-22 09:42",
  },
  {
    teacherId: "chenyu",
    name: "陈雨",
    type: "问答评分",
    calls: 36,
    amount: "16,400 tokens",
    last: "2026-09-22 09:38",
  },
  {
    teacherId: "zhouning",
    name: "周宁",
    type: "语音转写",
    calls: 24,
    amount: "63 分钟",
    last: "2026-09-21 16:32",
  },
  {
    teacherId: "zhouning",
    name: "周宁",
    type: "故事评分",
    calls: 16,
    amount: "20,800 tokens",
    last: "2026-09-21 16:28",
  },
  {
    teacherId: "zhouning",
    name: "周宁",
    type: "问答评分",
    calls: 24,
    amount: "10,600 tokens",
    last: "2026-09-21 16:25",
  },
];
export type ContentKind = "courses" | "assessments" | "dictionaries";
export const contentInfo = {
  courses: {
    title: "课程材料",
    subtitle: "让每一份用心准备的课程，抵达需要它的课堂。",
    letter: "C",
    file: "森林里的新朋友.zip",
    name: "森林里的新朋友",
    meta: "课程材料 · 版本 1.0",
    description: "上传课程材料包，为教师提供故事、图片与课堂活动资源。",
  },
  assessments: {
    title: "评估材料",
    subtitle: "从一次认真倾听开始，看见孩子的每一点成长。",
    letter: "A",
    file: "叙事能力评估材料.zip",
    name: "叙事能力评估材料",
    meta: "评估材料 · 版本 1.0",
    description: "上传前测与复评材料，支持教师开展一致的评估。",
  },
  dictionaries: {
    title: "字典材料",
    subtitle: "把词语讲清楚，让理解多发生一点。",
    letter: "D",
    file: "基础词语字典.json",
    name: "基础词语字典",
    meta: "字典材料 · 示例",
    description: "上传词语、拼音与释义材料，为课程提供阅读支持。",
  },
} satisfies Record<
  ContentKind,
  {
    title: string;
    subtitle: string;
    letter: string;
    file: string;
    name: string;
    meta: string;
    description: string;
  }
>;
