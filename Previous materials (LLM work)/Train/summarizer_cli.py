#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Summarizer CLI (Integrated & Optimized)
=======================================
- Combines features from Summary.py & Summary2.py.
- Clean separation between MODEL LOADING and I/O/PROCESSING.
- GPU/CPU auto-detect with explicit override (--device auto|cpu|cuda).
- Token-based chunking to respect model input limits.
- Progress bars (tqdm) for visibility of end-to-end progress.
- Optional visualization of chunk token sizes (--visualize) saved as PNG.
- Supports LoRA fine-tuned weights (merge into base) or pure base model.

Usage examples
--------------
# 1) Summarize a file with auto device
python summarizer_cli.py --input transcript.txt --out transcript_summary.txt

# 2) Force CPU and disable LoRA
python summarizer_cli.py --input transcript.txt --device cpu --no-lora

# 3) Provide inline text instead of a file
python summarizer_cli.py --text "Long text here..."

# 4) Save per-chunk summaries and create a chart
python summarizer_cli.py --input transcript.txt --save-chunk-summaries chunks.txt --visualize

Notes on GPU/CPU
----------------
- The script automatically uses CUDA GPU if available (torch.cuda.is_available()).
- Otherwise falls back to CPU.
- Where tensors/models move to GPU/CPU is explicitly marked in code comments.
"""
import os
import sys
import json
import time
import math
import argparse
import logging
from pathlib import Path
from typing import List, Tuple, Optional

import torch  # <-- GPU/CPU detection happens with torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from peft import PeftModel
from tqdm import tqdm  # progress bar

# Visualization is optional; only used if --visualize
try:
    import matplotlib.pyplot as plt
except Exception:
    plt = None


# ------------------------------
# Logging
# ------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("summarizer")


# ------------------------------
# Device & Dtype Utilities
# ------------------------------
def auto_select_device(user_choice: str = "auto") -> str:
    """
    Decide device: 'cuda' if available and user allows, else 'cpu'.
    """
    user_choice = (user_choice or "auto").lower()
    if user_choice == "cuda":
        if torch.cuda.is_available():
            return "cuda"
        log.warning("CUDA requested but not available; falling back to CPU.")
        return "cpu"
    if user_choice == "cpu":
        return "cpu"
    # auto
    return "cuda" if torch.cuda.is_available() else "cpu"


def pick_torch_dtype(device: str) -> torch.dtype:
    """
    Prefer float16 on CUDA (common for inference), else float32 on CPU.
    """
    if device == "cuda":
        # If your GPU supports bfloat16 and you prefer it, you could switch here.
        return torch.float16
    return torch.float32


# ------------------------------
# Model Loading (separate from I/O)
# ------------------------------
def load_summarizer_model(
    base_model: str = "facebook/bart-large-cnn",
    lora_model: Optional[str] = "Kishan25/Story_Summarizer",
    device_choice: str = "auto",
    merge_lora: bool = True,
) -> Tuple[AutoTokenizer, AutoModelForSeq2SeqLM, str]:
    """
    Load tokenizer and model, optionally merging LoRA weights.
    Returns (tokenizer, model, device) where model is placed on device.

    GPU/CPU NOTE:
    - We detect device and move the model to GPU (CUDA) if available; else CPU.
    - Inputs are also moved to the same device before generation.
    """
    device = auto_select_device(device_choice)
    dtype = pick_torch_dtype(device)

    t0 = time.time()
    log.info(f"Loading base model: {base_model} (device={device}, dtype={dtype})")
    tokenizer = AutoTokenizer.from_pretrained(base_model, use_fast=True)
    model = AutoModelForSeq2SeqLM.from_pretrained(base_model, torch_dtype=dtype)
    load_base_ms = (time.time() - t0) * 1000.0

    if lora_model:
        log.info(f"Loading LoRA adapter: {lora_model}")
        t1 = time.time()
        model = PeftModel.from_pretrained(model, lora_model)
        if merge_lora:
            log.info("Merging LoRA weights into base...")
            model = model.merge_and_unload()
        load_lora_ms = (time.time() - t1) * 1000.0
        log.info(f"LoRA loaded in {load_lora_ms:.0f} ms")
    else:
        log.info("No LoRA adapter requested; using base model only.")

    # Move model to device (GPU/CPU)
    model = model.to(device)  # <-- GPU/CPU move

    log.info(f"Base model loaded in {load_base_ms:.0f} ms | device={device}")
    return tokenizer, model, device


# ------------------------------
# Token-based Chunking
# ------------------------------
def chunk_by_tokens(
    tokenizer: AutoTokenizer,
    text: str,
    max_input_tokens: int = 1024,
    overlap_tokens: int = 64,
) -> Tuple[List[str], List[int]]:
    """
    Split long text into token-based chunks that fit the encoder max length.

    Returns (chunks, token_counts_per_chunk)
    """
    # Strip to avoid accidental huge whitespace spans
    text = " ".join(text.split())
    # Encode once
    all_ids = tokenizer.encode(text, add_special_tokens=False)
    if len(all_ids) == 0:
        return [], []

    stride = max(1, max_input_tokens - overlap_tokens)
    chunks, token_counts = [], []
    for start in range(0, len(all_ids), stride):
        end = min(start + max_input_tokens, len(all_ids))
        ids_slice = all_ids[start:end]
        if not ids_slice:
            break
        chunk_text = tokenizer.decode(ids_slice, skip_special_tokens=True)
        chunks.append(chunk_text)
        token_counts.append(len(ids_slice))
        if end >= len(all_ids):
            break

    return chunks, token_counts


# ------------------------------
# Summarization Core
# ------------------------------
def summarize_chunk(
    model: AutoModelForSeq2SeqLM,
    tokenizer: AutoTokenizer,
    text: str,
    device: str = "cpu",
    max_input_tokens: int = 1024,
    gen_min_new_tokens: int = 50,
    gen_max_new_tokens: int = 150,
    num_beams: int = 4,
) -> str:
    """
    Summarize a single chunk of text.
    GPU/CPU NOTE:
    - Inputs are moved to the same device as the model ('cuda' or 'cpu').
    """
    # Tokenize and move to device (GPU/CPU) for inference
    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=max_input_tokens,
    ).to(device)  # <-- move tensors to GPU/CPU

    with torch.no_grad():  # no gradient needed for inference
        try:
            # Newer Transformers: prefer max_new_tokens/min_new_tokens
            out_ids = model.generate(
                **inputs,
                max_new_tokens=gen_max_new_tokens,
                min_new_tokens=max(0, min(gen_min_new_tokens, gen_max_new_tokens - 1)),
                num_beams=num_beams,
                length_penalty=2.0,
                early_stopping=True,
            )
        except TypeError:
            # Fallback for older versions: use max_length/min_length
            out_ids = model.generate(
                **inputs,
                max_length=min(max_input_tokens, gen_max_new_tokens + 32),
                min_length=max(1, gen_min_new_tokens),
                num_beams=num_beams,
                length_penalty=2.0,
                early_stopping=True,
            )

    return tokenizer.decode(out_ids[0], skip_special_tokens=True)


def summarize_long_text(
    model: AutoModelForSeq2SeqLM,
    tokenizer: AutoTokenizer,
    text: str,
    device: str = "cpu",
    max_input_tokens: int = 1024,
    overlap_tokens: int = 64,
    gen_min_new_tokens: int = 50,
    gen_max_new_tokens: int = 150,
    num_beams: int = 4,
    save_chunk_summaries: Optional[Path] = None,
) -> Tuple[str, List[str], List[int]]:
    """
    Full pipeline: chunk -> per-chunk summaries -> global summary.

    Returns (final_summary, per_chunk_summaries, chunk_token_counts)
    """
    chunks, token_counts = chunk_by_tokens(
        tokenizer, text, max_input_tokens=max_input_tokens, overlap_tokens=overlap_tokens
    )
    if not chunks:
        return "", [], []

    per_chunk_summaries: List[str] = []
    # Progress bar across chunks
    for i, ch in enumerate(tqdm(chunks, desc="Summarizing chunks", unit="chunk"), start=1):
        s = summarize_chunk(
            model=model,
            tokenizer=tokenizer,
            text=ch,
            device=device,
            max_input_tokens=max_input_tokens,
            gen_min_new_tokens=gen_min_new_tokens,
            gen_max_new_tokens=gen_max_new_tokens,
            num_beams=num_beams,
        )
        per_chunk_summaries.append(s)

    # Optionally save intermediate chunk summaries
    if save_chunk_summaries:
        save_chunk_summaries = Path(save_chunk_summaries)
        with save_chunk_summaries.open("w", encoding="utf-8") as f:
            for idx, s in enumerate(per_chunk_summaries, 1):
                f.write(f"[Chunk {idx}]\n{s}\n\n")
        log.info(f"Per-chunk summaries saved to: {save_chunk_summaries}")

    # Final global summary from combined per-chunk summaries
    combined = " ".join(per_chunk_summaries)
    log.info("Generating final global summary...")
    final_summary = summarize_chunk(
        model=model,
        tokenizer=tokenizer,
        text=combined,
        device=device,
        max_input_tokens=max_input_tokens,
        gen_min_new_tokens=gen_min_new_tokens,
        gen_max_new_tokens=gen_max_new_tokens,
        num_beams=num_beams,
    )
    return final_summary, per_chunk_summaries, token_counts


# ------------------------------
# Visualization
# ------------------------------
def visualize_chunks(token_counts: List[int], out_png: Path) -> None:
    """
    Create a simple bar chart of token size per chunk.
    Only used if --visualize and matplotlib is available.
    """
    if plt is None:
        log.warning("matplotlib is not installed; skipping visualization.")
        return
    if not token_counts:
        log.warning("No chunks to visualize.")
        return

    import matplotlib
    matplotlib.use("Agg")  # headless

    fig = plt.figure(figsize=(10, 4.5))
    ax = fig.add_subplot(111)
    ax.bar(range(1, len(token_counts) + 1), token_counts)
    ax.set_title("Token count per chunk")
    ax.set_xlabel("Chunk index")
    ax.set_ylabel("Tokens")
    fig.tight_layout()
    fig.savefig(out_png)
    plt.close(fig)
    log.info(f"Visualization saved: {out_png}")


# ------------------------------
# I/O Helpers
# ------------------------------
def read_input_text(input_path: Optional[Path], inline_text: Optional[str]) -> str:
    """
    Distinguish between loading from file (后面读取的部分) and inline text.
    """
    if input_path and input_path.exists():
        text = input_path.read_text(encoding="utf-8", errors="ignore")
        log.info(f"Loaded input from file: {input_path} ({len(text)} chars)")
        return text
    if inline_text:
        log.info(f"Loaded input from --text argument ({len(inline_text)} chars)")
        return inline_text
    raise FileNotFoundError("No input provided. Use --input <file> or --text '...'.")


def write_output_text(output_path: Path, text: str) -> None:
    output_path.write_text(text, encoding="utf-8")
    log.info(f"Final summary written to: {output_path}")


# ------------------------------
# CLI
# ------------------------------
def build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Long-text Summarizer (BART + optional LoRA)")
    io = p.add_argument_group("I/O")
    io.add_argument("--input", type=str, default=None, help="Path to input .txt")
    io.add_argument("--text", type=str, default=None, help="Inline text content to summarize")
    io.add_argument("--out", type=str, default=None, help="Output summary file path (.txt)")
    io.add_argument("--save-chunk-summaries", type=str, default=None, help="Optional path to save per-chunk summaries")

    mdl = p.add_argument_group("Model")
    mdl.add_argument("--base-model", type=str, default="facebook/bart-large-cnn", help="HF base model id")
    mdl.add_argument("--lora", type=str, default="Kishan25/Story_Summarizer", help="PEFT LoRA adapter id (set --no-lora to disable)")
    mdl.add_argument("--no-lora", action="store_true", help="Disable LoRA adapter (use base model only)")
    mdl.add_argument("--device", type=str, default="auto", choices=["auto", "cpu", "cuda"], help="Device selection")

    inf = p.add_argument_group("Inference")
    inf.add_argument("--max-input-tokens", type=int, default=1024, help="Max encoder tokens per chunk")
    inf.add_argument("--overlap-tokens", type=int, default=64, help="Token overlap between chunks")
    inf.add_argument("--gen-min-new", type=int, default=50, help="Minimum new tokens in generation")
    inf.add_argument("--gen-max-new", type=int, default=150, help="Maximum new tokens in generation")
    inf.add_argument("--beams", type=int, default=4, help="Beam search beams")

    viz = p.add_argument_group("Visualization")
    viz.add_argument("--visualize", action="store_true", help="Save a PNG chart of token count per chunk")

    return p


def main(argv: Optional[List[str]] = None) -> int:
    args = build_argparser().parse_args(argv)

    input_path = Path(args.input).expanduser() if args.input else None
    output_path = Path(args.out).expanduser() if args.out else None
    chunk_summ_path = Path(args.save_chunk_summaries).expanduser() if args.save_chunk_summaries else None

    # Load model separately from reading text (as requested)
    lora_id = None if args.no_lora else args.lora
    tokenizer, model, device = load_summarizer_model(
        base_model=args.base_model,
        lora_model=lora_id,
        device_choice=args.device,
        merge_lora=True,
    )

    # Read input (file or inline) separately
    text = read_input_text(input_path=input_path, inline_text=args.text)

    # Derive output path if not provided
    if output_path is None:
        if input_path:
            output_path = input_path.with_name(input_path.stem + "_summary.txt")
        else:
            output_path = Path.cwd() / "summary.txt"

    # Run summarization with progress bar
    final_summary, per_chunk_summaries, token_counts = summarize_long_text(
        model=model,
        tokenizer=tokenizer,
        text=text,
        device=device,
        max_input_tokens=args.max_input_tokens,
        overlap_tokens=args.overlap_tokens,
        gen_min_new_tokens=args.gen_min_new,
        gen_max_new_tokens=args.gen_max_new,
        num_beams=args.beams,
        save_chunk_summaries=chunk_summ_path,
    )

    write_output_text(output_path, final_summary)

    # Optional visualization
    if args.visualize:
        png_path = output_path.with_suffix(".chunks.png")
        visualize_chunks(token_counts, png_path)

    # Output brief JSON metadata (optional, for automation)
    meta = {
        "device": device,
        "base_model": args.base_model,
        "lora_model": lora_id or "",
        "chunks": len(token_counts),
        "tokens_per_chunk": token_counts,
        "output": str(output_path),
        "chunk_summaries": str(chunk_summ_path) if chunk_summ_path else "",
        "visualization": str(output_path.with_suffix(".chunks.png")) if args.visualize else "",
    }
    print(json.dumps(meta, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
