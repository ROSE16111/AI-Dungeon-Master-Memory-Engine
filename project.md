```
src/app/
└─ page.tsx                 ← 目前打算这一面做login页面，指向dashboard

└─ (dashboard)/

   ├─ layout.tsx           ← 这组路由的公共外壳
   ├─ dashboard.tsx             ← /dashboard
      └─ page.tsx
   ├─ sessions/
   │  └─ [id]/
   │     └─ page.tsx       ← /sessions/123
   └─ graph/
      └─ page.tsx          ← /graph

└─ api/
    ├─ analyze
    ├─ upload

└─ components/
        ├─ layout       ← 外壳
```
#
这里是api的描述，做的时候可以先不管api，纯做前端。api连着后端输出结果给数据库再显示在前端
```
npx prisma generate
npx prisma migrate dev --name init
```
## **dashboard.tsx**: 
这就是一个 Client Component，用 useState 管状态，然后调用两个接口：/api/upload 和 /api/analyze。关键流程：

* 选择文件 → onFile()：把文件塞进 FormData，POST /api/upload，拿到后端返回的 data.text，然后 setText(data.text)。

* 点按钮 → analyze()：把 text 作为 JSON 发给 POST /api/analyze，后端返回结构化结果（语言、关键句、关键词、sessionId），再渲染在页面上

## /api/upload（接收文件→提取纯文本→返回）

职责
* 解析 multipart/form-data
* 按扩展名/ MIME 选择解析器
* 把 docx/pdf/txt 转成一段 纯文本字符串
* return { text }
常用库（Node runtime）
* .docx → mammoth（最省心，提纯文本）
* .pdf → pdf-parse（Node 常用）或 pdfjs-dist（Web 也可）
* .txt → 直接 buffer.toString('utf8')
⚠️ 这些库大多需要 Node.js runtime。如果你的路由写了 export const runtime = 'edge'，就很容易在运行期报错或拿不到内容。
* note: `npm i mammoth pdf-parse` install pdf parse package
## /api/analyze（接收文本→做 NLP/LLM→入库→返回）

职责
* 校验输入 text
* 做语言检测（可选：franc/tinyld）；做关键句、关键词提取
* 方案 A（快 & 免外部服务）：keyword-extractor / compromise / natural / wink-nlp / TextRank 实现
* 方案 B（效果更稳）：走 LLM（如 OpenAI），让模型抽取关键句和关键词
* 用 Prisma 保存一条 session 记录（包含原文、关键词/关键句数组、来源 source）
* return { sessionId, language, keySentences, keyPhrases }