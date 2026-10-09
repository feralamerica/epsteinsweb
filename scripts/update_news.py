"""Refresh news.json for epsteinsweb.com from publishers' own RSS feeds.

Runs on a schedule in GitHub Actions (.github/workflows/update-news.yml).
Only stories from the outlets listed in FEEDS are used, and only headlines
that mention Epstein or Maxwell. Survivors are never named: any headline
that names a survivor is skipped. Standard library only.
"""
import json, re, html, datetime, urllib.request, email.utils, xml.etree.ElementTree as ET

# (outlet name, feed URL, needs keyword filter)
FEEDS = [
    ("The Guardian", "https://www.theguardian.com/us-news/jeffrey-epstein/rss", False),
    ("The New York Times", "https://www.nytimes.com/svc/collections/v1/publish/https://www.nytimes.com/topic/person/jeffrey-epstein/rss.xml", False),
    ("NBC News", "https://feeds.nbcnews.com/nbcnews/public/news", True),
    ("CBS News", "https://www.cbsnews.com/latest/rss/main", True),
    ("ABC News", "https://abcnews.go.com/abcnews/topstories", True),
    ("NPR", "https://feeds.npr.org/1014/rss.xml", True),
    ("NPR", "https://feeds.npr.org/1001/rss.xml", True),
    ("PBS News", "https://www.pbs.org/newshour/feeds/rss/headlines", True),
    ("BBC News", "https://feeds.bbci.co.uk/news/rss.xml", True),
    ("BBC News", "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml", True),
    ("BBC News", "https://feeds.bbci.co.uk/news/uk/rss.xml", True),
    ("Sky News", "https://feeds.skynews.com/feeds/rss/uk.xml", True),
    ("Politico", "https://rss.politico.com/politics-news.xml", True),
    ("The Hill", "https://thehill.com/news/feed/", True),
    ("Los Angeles Times", "https://www.latimes.com/world-nation/rss2.0.xml", True),
    ("Mother Jones", "https://www.motherjones.com/feed/", True),
    ("The Daily Beast", "https://www.thedailybeast.com/arc/outboundfeeds/rss/articles/", True),
    ("The Guardian", "https://www.theguardian.com/us-news/rss", True),
    ("The Guardian", "https://www.theguardian.com/uk/rss", True),
]
KEYWORDS = re.compile(r"\b(epstein|ghislaine|maxwell)\b", re.I)
# Headlines that name a survivor are skipped entirely.
SURVIVORS = re.compile(r"giuffre|virginia roberts|maria farmer|annie farmer|sarah ransome|courtney wild|jennifer araoz|johanna sjoberg|chauntae davies|michelle licata|juliette bryant|rina oh|haley robson|teala davies|marijke chartouni|liz stein|jess michaels|dani bensky|marina lacerda|lisa phillips", re.I)
MAX_ITEMS = 8
MAX_AGE_DAYS = 14
UA = "Mozilla/5.0 (compatible; EpsteinsWebNews/1.0; +https://epsteinsweb.com)"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read()


def clean(t):
    t = html.unescape(re.sub(r"<[^>]+>", "", t or "")).strip()
    t = re.sub(r"\s*[—–]\s*", ": ", t, count=1)  # site style: no em or en dashes
    t = re.sub(r"\s*[—–]\s*", ", ", t)
    return re.sub(r"\s+", " ", t)


def parse_date(s):
    try:
        d = email.utils.parsedate_to_datetime(s)
        return d if d.tzinfo else d.replace(tzinfo=datetime.timezone.utc)
    except Exception:
        try:
            return datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            return None


def items_from(xml_bytes):
    root = ET.fromstring(xml_bytes)
    ns = {"a": "http://www.w3.org/2005/Atom"}
    for it in root.iter("item"):
        yield it.findtext("title"), it.findtext("link"), it.findtext("pubDate") or it.findtext("{http://purl.org/dc/elements/1.1/}date")
    for it in root.iter("{http://www.w3.org/2005/Atom}entry"):
        link = it.find("a:link", ns)
        yield it.findtext("a:title", namespaces=ns), link.get("href") if link is not None else "", it.findtext("a:updated", namespaces=ns)


def main():
    now = datetime.datetime.now(datetime.timezone.utc)
    seen, out = set(), []
    for outlet, url, filt in FEEDS:
        try:
            data = fetch(url)
            entries = list(items_from(data))
        except Exception as e:
            print("skip", outlet, url, e)
            continue
        for title, link, pub in entries:
            title = clean(title)
            if not title or not link or not link.startswith("https://"):
                continue
            if filt and not KEYWORDS.search(title):
                continue
            if SURVIVORS.search(title):
                continue
            d = parse_date(pub or "")
            if not d or (now - d).days > MAX_AGE_DAYS:
                continue
            key = re.sub(r"[^a-z0-9]", "", title.lower())[:70]
            if key in seen or link in seen:
                continue
            seen.add(key); seen.add(link)
            out.append({"ts": d.isoformat(), "date": d.strftime("%b ") + str(d.day), "title": title, "source": outlet, "url": link.strip()})
    out.sort(key=lambda x: x["ts"], reverse=True)
    # keep the feed varied: at most 3 stories from any one outlet
    picked, per = [], {}
    for x in out:
        if per.get(x["source"], 0) >= 3:
            continue
        per[x["source"]] = per.get(x["source"], 0) + 1
        picked.append(x)
        if len(picked) >= MAX_ITEMS:
            break
    if not picked:
        print("no stories found; leaving news.json unchanged")
        return
    doc = {"updated": now.isoformat(timespec="minutes"), "items": picked}
    with open("news.json", "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print("wrote", len(picked), "stories")


if __name__ == "__main__":
    main()
