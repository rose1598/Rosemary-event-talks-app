import os
import time
import json
import urllib.request
import xml.etree.ElementTree as ET
from flask import Flask, render_template, jsonify
from bs4 import BeautifulSoup

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
CACHE_FILE = "releases_cache.json"

def fetch_and_parse_feed():
    try:
        # Fetch xml feed with a proper User-Agent
        req = urllib.request.Request(
            FEED_URL, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            xml_data = response.read()
            
        root = ET.fromstring(xml_data)
        ns = "{http://www.w3.org/2005/Atom}"
        entries = root.findall(f"{ns}entry")
        
        all_updates = []
        for index, entry in enumerate(entries):
            date = entry.find(f"{ns}title").text.strip()
            
            # Extract updated timestamp for precise sorting/display
            updated_elem = entry.find(f"{ns}updated")
            updated_time = updated_elem.text.strip() if updated_elem is not None else ""
            
            # Extract entry ID
            id_elem = entry.find(f"{ns}id")
            entry_id = id_elem.text.strip() if id_elem is not None else str(index)
            
            # Extract link
            link_elem = entry.find(f"{ns}link")
            link = ""
            if link_elem is not None:
                link = link_elem.attrib.get('href', '')
            
            content_elem = entry.find(f"{ns}content")
            content_html = content_elem.text if content_elem is not None else ""
            
            # Parse HTML content with BeautifulSoup
            soup = BeautifulSoup(content_html, 'html.parser')
            h3_elements = soup.find_all('h3')
            
            if not h3_elements:
                # Fallback if no h3 sections
                text_content = soup.get_text().strip()
                # Remove extra spaces
                text_content = " ".join(text_content.split())
                all_updates.append({
                    'id': f"{entry_id}_0",
                    'date': date,
                    'updated_time': updated_time,
                    'type': 'General',
                    'html': content_html,
                    'text': text_content,
                    'link': link
                })
                continue
                
            for h3_idx, h3 in enumerate(h3_elements):
                update_type = h3.get_text().strip()
                sibling_html = []
                sibling_text = []
                curr = h3.next_sibling
                while curr and curr.name != 'h3':
                    if curr.name:
                        sibling_html.append(str(curr))
                        sibling_text.append(curr.get_text().strip())
                    curr = curr.next_sibling
                    
                update_html = "".join(sibling_html)
                update_text = " ".join([t for t in sibling_text if t])
                
                # Clean up whitespace
                update_text = " ".join(update_text.split())
                
                all_updates.append({
                    'id': f"{entry_id}_{h3_idx}",
                    'date': date,
                    'updated_time': updated_time,
                    'type': update_type,
                    'html': update_html,
                    'text': update_text,
                    'link': link
                })
                
        cache_data = {
            'last_updated': time.time(),
            'releases': all_updates
        }
        
        # Save cache
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f, ensure_ascii=False, indent=2)
            
        return cache_data, None
    except Exception as e:
        return None, str(e)

def get_cached_releases():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def api_releases():
    cache = get_cached_releases()
    if not cache:
        # Fetch for the first time
        cache, err = fetch_and_parse_feed()
        if err:
            return jsonify({'success': False, 'error': err}), 500
    return jsonify({'success': True, 'data': cache})

@app.route('/api/refresh', methods=['POST'])
def api_refresh():
    cache, err = fetch_and_parse_feed()
    if err:
        return jsonify({'success': False, 'error': err}), 500
    return jsonify({'success': True, 'data': cache})

if __name__ == '__main__':
    # Initialize cache on startup if not exists
    if not get_cached_releases():
        fetch_and_parse_feed()
    app.run(debug=True, port=5000)
