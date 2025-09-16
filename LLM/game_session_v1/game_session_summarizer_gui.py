# game_session_summarizer_gui.py
import os, re, json, threading, time, datetime
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from typing import List, Dict, Any, Optional
import requests

# Optional faster PDF extraction
try:
    import fitz  # PyMuPDF
except Exception:
    fitz = None

try:
    import PyPDF2
except Exception:
    PyPDF2 = None

try:
    import docx  # python-docx
except Exception:
    docx = None

AUS_TZ = datetime.timezone(datetime.timedelta(hours=10))

def now_iso():
    return datetime.datetime.now(AUS_TZ).isoformat(timespec="seconds")

def read_text(path: str) -> str:
    low = path.lower()
    if low.endswith(".pdf"):
        if fitz is not None:
            text = []
            with fitz.open(path) as doc:
                for p in doc:
                    text.append(p.get_text("text"))
            return "\n".join(text)
        if not PyPDF2:
            raise RuntimeError("Install PyMuPDF or PyPDF2 for PDFs")
        text = []
        with open(path, "rb") as f:
            r = PyPDF2.PdfReader(f)
            for p in r.pages:
                text.append(p.extract_text() or "")
        return "\n".join(text)
    if low.endswith(".docx"):
        if not docx:
            raise RuntimeError("Install python-docx for .docx files")
        d = docx.Document(path)
        return "\n".join([para.text for para in d.paragraphs])
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()

def split_chunks(text: str, max_chars=6000, overlap=300) -> List[str]:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= max_chars:
        return [text]
    out = []
    i = 0
    n = len(text)
    while i < n:
        j = min(i + max_chars, n)
        if j < n:
            k = text.rfind(".", i, j)
            if k == -1: k = text.rfind("。", i, j)
            if k == -1: k = text.rfind("!", i, j)
            if k == -1: k = text.rfind("?", i, j)
            if k == -1: k = text.rfind(" ", i, j)
            if k != -1 and k > i + 300: j = k + 1
        out.append(text[i:j].strip())
        i = max(0, j - overlap)
    return [c for c in out if c]

def call_ollama(model: str, prompt: str, num_predict: int = 256, temperature: float = 0.1, timeout: int = 120) -> str:
    r = requests.post(os.getenv("OLLAMA_HOST","http://127.0.0.1:11434") + "/api/generate",
                      json={
                          "model": model,
                          "prompt": prompt,
                          "stream": False,
                          "options": {
                              "temperature": temperature,
                              "top_p": 0.9,
                              "top_k": 40,
                              "num_predict": num_predict
                          }
                      },
                      timeout=timeout)
    r.raise_for_status()
    return r.json().get("response","").strip()

def extract_json_block(s: str) -> str:
    # 尝试匹配第一个完整的 {...}
    m = re.search(r"\{.*\}", s, flags=re.S)
    if m:
        return m.group(0)
    # 如果没有找到，返回一个空 JSON，避免报错
    return "{}"

ENTITY_PROMPT = """You are extracting global entities from a game session document.
Return JSON only: {"players":[...], "places":[...]}. "players" are human/character names; "places" are locations/venues/maps.
Text:
{chunk}"""

ENTITY_MERGE_PROMPT = """You are merging entity lists from multiple chunks.
Given JSON lists of players and places from all chunks, return a single JSON:
{"players":[unique canonical names], "places":[unique canonical places]}.
Normalize capitalization, merge aliases (e.g., 'Alex' & 'Alexander' -> 'Alexander' if context suggests). Keep real human-like names.
All extracted lists:
{items}"""

SEGMENT_SUMMARY_PROMPT = """You know the global context of this game session.
Global players: {players}
Global places: {places}

Task: Summarize the NEW information contained in the following segment.
Return JSON only:
{
 "summary_bullets": ["- ...", "..."],
 "mentions": {"players": [...], "places": [...]},
 "new_entities": {"players": [...], "places": [...]}
}
Only include bullets that are new compared to typical intro info. Keep each bullet <= 24 words.

Segment:
{segment}"""

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Game Session Summarizer (Global Entities + Incremental Segments)")
        self.geometry("1100x780")
        self.minsize(980, 700)

        self.model_var = tk.StringVar(value="llama3.1")
        self.file_var = tk.StringVar(value="")
        self.status_var = tk.StringVar(value="Idle")
        self.players: List[str] = []
        self.places: List[str] = []
        self.summary_history: List[str] = []

        self._build_ui()

    def _build_ui(self):
        cfg = ttk.LabelFrame(self, text="Configuration")
        cfg.pack(fill=tk.X, padx=12, pady=10)

        ttk.Label(cfg, text="Model").grid(row=0, column=0, sticky="w", padx=6, pady=6)
        self.model_combo = ttk.Combobox(cfg, textvariable=self.model_var,
                                        values=["llama3.1","qwen2","mistral",
                                                "llama3.1:8b-instruct-q4_K_M",
                                                "qwen2:7b-instruct-q4_K_M",
                                                "mistral:7b-instruct-q4_K_M"],
                                        state="readonly", width=28)
        self.model_combo.grid(row=0, column=1, sticky="w", padx=6)

        ttk.Label(cfg, text="File (.txt/.docx/.pdf)").grid(row=0, column=2, sticky="w", padx=(24,6))
        self.file_entry = ttk.Entry(cfg, textvariable=self.file_var, width=58)
        self.file_entry.grid(row=0, column=3, sticky="we", pady=6)
        ttk.Button(cfg, text="Browse", command=self.pick_file).grid(row=0, column=4, sticky="w", padx=6)

        ttk.Button(cfg, text="Global Scan (Players & Places)", command=self.run_global_scan).grid(row=1, column=0, columnspan=2, sticky="w", padx=6, pady=6)

        ttk.Label(cfg, textvariable=self.status_var).grid(row=1, column=3, columnspan=2, sticky="e", padx=6)

        body = ttk.Panedwindow(self, orient=tk.HORIZONTAL)
        body.pack(fill=tk.BOTH, expand=True, padx=12, pady=10)

        left = ttk.Frame(body); right = ttk.Frame(body)
        body.add(left, weight=1); body.add(right, weight=2)

        # Left: Global Entities
        ge = ttk.LabelFrame(left, text="Global Entities")
        ge.pack(fill=tk.BOTH, expand=True, padx=6, pady=6)
        ttk.Label(ge, text="Players").pack(anchor="w")
        self.players_list = tk.Listbox(ge, height=10)
        self.players_list.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)
        ttk.Label(ge, text="Places").pack(anchor="w")
        self.places_list = tk.Listbox(ge, height=8)
        self.places_list.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)

        # Right: Segment input and summaries
        seg = ttk.LabelFrame(right, text="Segment Summaries (Incremental)")
        seg.pack(fill=tk.BOTH, expand=True, padx=6, pady=6)

        ttk.Label(seg, text="New Segment Text").pack(anchor="w")
        self.segment_text = tk.Text(seg, height=8, wrap="word")
        self.segment_text.pack(fill=tk.BOTH, expand=False, padx=4, pady=4)

        seg_btns = ttk.Frame(seg); seg_btns.pack(fill=tk.X, padx=4, pady=4)
        ttk.Button(seg_btns, text="Summarize Segment", command=self.run_segment_summary).pack(side=tk.LEFT)
        ttk.Button(seg_btns, text="Clear Segment", command=lambda: self.segment_text.delete("1.0", tk.END)).pack(side=tk.LEFT, padx=8)
        ttk.Button(seg_btns, text="Reset Session", command=self.reset_session).pack(side=tk.RIGHT)

        ttk.Label(seg, text="Summary Output (Newest on top)").pack(anchor="w", pady=(4,0))
        self.summary_box = tk.Text(seg, height=20, wrap="word")
        self.summary_box.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)

        # Bottom logs
        logs = ttk.LabelFrame(self, text="Logs")
        logs.pack(fill=tk.BOTH, expand=False, padx=12, pady=(0,10))
        self.log_box = tk.Text(logs, height=8, wrap="word")
        self.log_box.pack(fill=tk.BOTH, expand=True)

    def log(self, msg: str):
        self.log_box.insert(tk.END, f"[{now_iso()}] {msg}\n")
        self.log_box.see(tk.END)
        self.update_idletasks()

    def pick_file(self):
        path = filedialog.askopenfilename(title="Choose file", filetypes=[("Documents","*.txt;*.docx;*.pdf"),("All","*.*")])
        if path:
            self.file_var.set(path)

    def set_status(self, s: str):
        self.status_var.set(s); self.update_idletasks()

    def run_global_scan(self):
        path = self.file_var.get().strip()
        if not path:
            messagebox.showwarning("Missing", "Please choose a file.")
            return
        self.set_status("Reading file..."); self.log("Reading file...")
        self.players, self.places = [], []
        self.players_list.delete(0, tk.END); self.places_list.delete(0, tk.END)

        def worker():
            try:
                text = read_text(path)
                self.log(f"Loaded {len(text)} chars")
                chunks = split_chunks(text, max_chars=6000, overlap=300)
                items = []
                for i, ch in enumerate(chunks, 1):
                    self.set_status(f"Extracting entities {i}/{len(chunks)}")
                    prompt = ENTITY_PROMPT.format(chunk=ch)
                    out = call_ollama(self.model_var.get(), prompt, num_predict=220, temperature=0.1, timeout=90)
                    js = extract_json_block(out) or "{}"
                    try:
                        obj = json.loads(js)
                    except Exception:
                        obj = {"players": [], "places": []}
                    items.append({"players": obj.get("players", []) or [], "places": obj.get("places", []) or []})
                    self.log(f"Chunk {i} entities: +{len(items[-1]['players'])} players, +{len(items[-1]['places'])} places")

                merge_prompt = ENTITY_MERGE_PROMPT.format(items=json.dumps(items, ensure_ascii=False))
                self.set_status("Merging entities")
                merged_out = call_ollama(self.model_var.get(), merge_prompt, num_predict=256, temperature=0.1, timeout=90)
                merged_js = extract_json_block(merged_out) or "{}"
                try:
                    merged = json.loads(merged_js)
                except Exception:
                    merged = {"players": [], "places": []}

                self.players = sorted(set(merged.get("players", []) or []), key=lambda s: s.lower())
                self.places = sorted(set(merged.get("places", []) or []), key=lambda s: s.lower())

                self.players_list.delete(0, tk.END); self.places_list.delete(0, tk.END)
                for p in self.players: self.players_list.insert(tk.END, p)
                for p in self.places: self.places_list.insert(tk.END, p)

                self.set_status(f"Ready · players={len(self.players)} places={len(self.places)}")
                self.log("Global scan complete.")
            except Exception as e:
                self.set_status("Error")
                self.log(f"Error: {e}")

        threading.Thread(target=worker, daemon=True).start()

    def run_segment_summary(self):
        seg = self.segment_text.get("1.0", tk.END).strip()
        if not seg:
            messagebox.showinfo("Empty", "Please paste segment text first.")
            return
        if not (self.players or self.places):
            if not messagebox.askyesno("No global entities", "Global entities list is empty. Continue?"):
                return
        self.set_status("Summarizing segment...")

        def worker():
            try:
                prompt = SEGMENT_SUMMARY_PROMPT.format(players=json.dumps(self.players, ensure_ascii=False),
                                                      places=json.dumps(self.places, ensure_ascii=False),
                                                      segment=seg)
                out = call_ollama(self.model_var.get(), prompt, num_predict=220, temperature=0.2, timeout=90)
                js = extract_json_block(out) or "{}"
                try:
                    obj = json.loads(js)
                except Exception:
                    obj = {"summary_bullets": [out], "mentions": {"players": [], "places": []}, "new_entities": {"players": [], "places": []}}

                new_players = [x for x in (obj.get("new_entities", {}).get("players", []) or []) if x]
                new_places = [x for x in (obj.get("new_entities", {}).get("places", []) or []) if x]

                added = False
                for p in new_players:
                    if p not in self.players:
                        self.players.append(p); added = True
                        self.players_list.insert(tk.END, p)
                for p in new_places:
                    if p not in self.places:
                        self.places.append(p); added = True
                        self.places_list.insert(tk.END, p)
                if added:
                    self.set_status(f"Updated · players={len(self.players)} places={len(self.places)}")

                bullets = obj.get("summary_bullets", [])
                block = "• " + "\n• ".join([b.lstrip("- ").strip() for b in bullets if b.strip()])
                stamp = f"[{now_iso()}]"
                final_text = f"{stamp}\n{block}\n\n"
                prev = self.summary_box.get("1.0", tk.END)
                self.summary_box.delete("1.0", tk.END)
                self.summary_box.insert(tk.END, final_text + prev)

                self.log(f"Segment mentions players={len(obj.get('mentions',{}).get('players',[]))} places={len(obj.get('mentions',{}).get('places',[]))}")
                self.set_status("Ready")
                self.segment_text.delete("1.0", tk.END)
            except Exception as e:
                self.set_status("Error")
                self.log(f"Error: {e}")

        threading.Thread(target=worker, daemon=True).start()

    def reset_session(self):
        self.players, self.places = [], []
        self.players_list.delete(0, tk.END); self.places_list.delete(0, tk.END)
        self.summary_box.delete("1.0", tk.END)
        self.segment_text.delete("1.0", tk.END)
        self.set_status("Idle")
        self.log("Session reset.")

if __name__ == "__main__":
    app = App()
    app.mainloop()
