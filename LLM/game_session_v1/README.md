# Game Session Summarizer GUI
# 游戏会话摘要工具 (图形界面版)

---

## 📖 Introduction | 简介

**English**  
This project provides a **desktop GUI tool** for summarizing game session documents (such as D&D transcripts).  
It can extract **players** and **places** from a text/PDF/Word document, and generate **incremental summaries** for new text segments.  
It is powered by [Ollama](https://ollama.ai/) (local LLM API).

**中文**  
该项目是一个 **桌面 GUI 工具**，用于对游戏会话文档（如 D&D 剧本记录）进行摘要。  
它可以从 TXT/PDF/Word 文档中提取 **玩家** 和 **地点**，并对新的片段生成 **增量摘要**。  
后台使用 [Ollama](https://ollama.ai/) 本地大模型 API。

---

## 📂 Project Structure | 项目结构

```
game-session-v1/
├── game_session_summarizer_gui.py  # Main program / 主程序
├── requirements.txt                # Dependencies / 依赖文件
├── README.md                       # Documentation / 文档

```

---

## 📦 Installation | 安装
```bash
git clone https://github.com/YOUR_USERNAME/game-session-summarizer.git
cd game-session-summarizer
pip install -r requirements.txt
```

```bash
克隆仓库并进入目录：
git clone https://github.com/YOUR_USERNAME/game-session-summarizer.git
cd game-session-summarizer

安装依赖：
pip install -r requirements.txt
```

---

## 🚀 Run Application | 运行程序

```bash
python game_session_summarizer_gui.py
```

```bash
python game_session_summarizer_gui.py
```

---

## 🖥️ Features | 功能

- **Global Entity Extraction / 全局实体提取**  
  Extracts **players** and **places** from a document.  

- **Incremental Summaries / 增量摘要**  
  Generate summaries for **newly added text segments**, highlighting new information.  

- **GUI Interface / 图形界面**  
  - Left: Players & Places  
  - Right: Segment input + summaries  
  - Bottom: Logs  

---

## 📡 How it Works | 工作流程

1. Choose a file (.txt/.docx/.pdf).  
2. Run **Global Scan** → Extract players and places.  
3. Paste a new text segment into the right box.  
4. Run **Summarize Segment** → Get incremental summary and updates to entity lists.  

---

## 🧩 Code Explanation | 代码解释

- **read_text()**: Reads text from TXT/PDF/DOCX.  
- **split_chunks()**: Splits long documents into manageable chunks.  
- **call_ollama()**: Calls Ollama local LLM API.  
- **extract_json_block()**: Ensures JSON is valid from LLM output.  
- **ENTITY_PROMPT / SEGMENT_SUMMARY_PROMPT**: LLM prompts for entity extraction and summaries.  
- **App (Tkinter GUI)**: Main GUI application class.  

---

## 🛠️ How to Modify & Debug | 修改与调试

- Change model list in `self.model_combo.values`.  
- Adjust chunk size in `split_chunks(max_chars=6000, overlap=300)`.  
- Modify Ollama API endpoint with environment variable `OLLAMA_HOST`.  
- Debug logs are shown in the bottom "Logs" window.  

- 修改 `self.model_combo.values` 添加/更换模型。  
- 调整 `split_chunks(max_chars=6000, overlap=300)` 改变分块大小。  
- 通过环境变量 `OLLAMA_HOST` 修改 Ollama API 地址。  
- 调试日志显示在底部“Logs”窗口。  

---
