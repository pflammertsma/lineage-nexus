"""
wiewaswie.py

Crawler for WieWasWie.nl
"""

# FIXME this unfortunately doesn't work due to CloudFlare blocking the crawler

from adk_app.constants import logger, MODEL_SMART, MODEL_MIXED, MODEL_FAST
from adk_app.util.utils import rate_limited_get
import httpx
import re
import json
from zoneinfo import ZoneInfo


HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    'Accent-Encoding': "gzip, deflate, br, zstd",
    'Accept-Language': "en,en-US;q=0,5",
    'Accept': "text/html,application/xhtml+xml,application/xml;q=0.9,/;q=0.8",
    'Cache-Control': "no-cache",
    'Dnt': '1',
    'Pragma': 'no-cache',
    'Priority': 'u=0, i',
    'Sec-Ch-Ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
}


def extract_source_id(wiewaswie_url: str) -> dict:
    """
    Given a wiewaswie.nl detail URL, fetches the page and extracts the source ID from the hyperlink containing 'Naar bron'.
    Returns a JSON object with both the wiewaswie ID and the source ID.
    """
    # Extract wiewaswie ID from the URL
    match = re.search(r'/detail/(\d+)', wiewaswie_url)
    wiewaswie_id = match.group(1) if match else None

    try:
        response = httpx.get(wiewaswie_url, headers=HEADERS)
        html = response.text
        # Find <a> tag with 'Naar bron' in its text
        anchor_match = re.search(r'<a\s+[^>]*href="([^"]+)"[^>]*>.*?Naar bron.*?</a>', html, re.IGNORECASE | re.DOTALL)
        if anchor_match:
            source_url = anchor_match.group(1)
            # Extract the source ID from the URL (UUID or last path segment)
            source_id_match = re.search(r'/([a-f0-9\-]{36,})', source_url)
            source_id = source_id_match.group(1) if source_id_match else source_url.split('/')[-1]
        else:
            print('\n\n\nNO MATCH')
            print(html)
            source_id = None
        return json.dumps({
            "wiewaswie_id": wiewaswie_id,
            "source_id": source_id
        })
    except Exception as e:
        return json.dumps({
            "wiewaswie_id": wiewaswie_id,
            "source_id": None,
            "error": str(e)
        })
