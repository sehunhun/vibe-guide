#!/usr/bin/env python3
"""
Summarize text or markdown content (e.g. saved from browser_snapshot).
Usage: python navigate_and_extract.py <file_path>
"""
import sys
import os


def process_markdown(file_path):
    if not os.path.exists(file_path):
        return f"Error: File {file_path} not found."

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.split("\n")
    summary = {
        "title": lines[0].strip() if lines else "No Title",
        "char_count": len(content),
        "line_count": len(lines),
        "link_count": content.count("]("),
    }
    return summary


if __name__ == "__main__":
    if len(sys.argv) > 1:
        path = sys.argv[1]
        result = process_markdown(path)
        if isinstance(result, dict):
            for k, v in result.items():
                print(f"{k}: {v}")
        else:
            print(result)
    else:
        print("Usage: python navigate_and_extract.py <file_path>")
