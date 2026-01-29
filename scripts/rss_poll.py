#!/usr/bin/env python3
"""
Poll an RSS/Atom feed and output unseen items.

Usage:
  rss_poll.py --feed <url> --state <state.json> [--max 50] [--keep 200] [--json]
"""

import argparse
import json
import urllib.request
import xml.etree.ElementTree as ET


def fetch_xml(url, timeout=20):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "news-subscription/1.0 (+rss poll)"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def text_or_none(elem, path):
    if elem is None:
        return None
    child = elem.find(path)
    if child is None or child.text is None:
        return None
    return child.text.strip()


def first_child_text_with_suffix(elem, suffixes):
    if elem is None:
        return None
    for child in list(elem):
        tag = child.tag.split("}")[-1]
        if tag in suffixes and child.text:
            return child.text.strip()
    return None


def parse_rss(root):
    channel = root.find("channel")
    if channel is None:
        return []
    items = []
    for item in channel.findall("item"):
        title = text_or_none(item, "title")
        link = text_or_none(item, "link")
        guid = text_or_none(item, "guid")
        pub_date = text_or_none(item, "pubDate")
        summary = text_or_none(item, "description") or first_child_text_with_suffix(
            item, {"encoded", "summary"}
        )
        key = guid or link or title
        if not key:
            continue
        items.append(
            {
                "key": key,
                "title": title or "(no title)",
                "link": link,
                "published": pub_date,
                "summary": summary,
            }
        )
    return items


def parse_atom(root):
    ns = "{http://www.w3.org/2005/Atom}"
    items = []
    for entry in root.findall(f"{ns}entry"):
        title = entry.findtext(f"{ns}title")
        link = None
        for link_el in entry.findall(f"{ns}link"):
            rel = link_el.attrib.get("rel")
            href = link_el.attrib.get("href")
            if rel in (None, "alternate") and href:
                link = href
                break
        entry_id = entry.findtext(f"{ns}id")
        published = entry.findtext(f"{ns}updated") or entry.findtext(f"{ns}published")
        summary = entry.findtext(f"{ns}summary") or entry.findtext(f"{ns}content")
        if summary is None:
            summary = first_child_text_with_suffix(entry, {"summary", "content"})
        key = entry_id or link or title
        if not key:
            continue
        items.append(
            {
                "key": key,
                "title": (title or "(no title)").strip(),
                "link": link,
                "published": published,
                "summary": summary,
            }
        )
    return items


def load_state(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"feeds": {}}
    except Exception:
        return {"feeds": {}}


def save_state(path, state):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--feed", required=True)
    parser.add_argument("--state", required=True)
    parser.add_argument("--max", type=int, default=50)
    parser.add_argument("--keep", type=int, default=200)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    state = load_state(args.state)
    feeds = state.setdefault("feeds", {})
    feed_state = feeds.setdefault(args.feed, {"seen": []})
    seen = set(feed_state.get("seen", []))

    xml_data = fetch_xml(args.feed)
    root = ET.fromstring(xml_data)

    if root.tag.endswith("rss") or root.find("channel") is not None:
        items = parse_rss(root)
    else:
        items = parse_atom(root)

    new_items = [it for it in items if it["key"] not in seen]
    new_items = list(reversed(new_items))[: args.max]

    if args.json:
        print(json.dumps(new_items, ensure_ascii=False))
    else:
        for it in new_items:
            line = it["title"]
            if it.get("link"):
                line += f"\n{it['link']}"
            if it.get("published"):
                line += f"\n{it['published']}"
            print(line)
            print("---")

    if new_items:
        for it in new_items:
            seen.add(it["key"])
        updated_keys = [it["key"] for it in items if it["key"] in seen]
        feed_state["seen"] = updated_keys[: args.keep]
        save_state(args.state, state)


if __name__ == "__main__":
    main()
