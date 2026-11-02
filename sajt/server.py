"""SAJT — lokalni server za probu sajta, sa adresama bez .html kao na GitHub Pages (/mapa → docs/mapa.html).

    python -m sajt.server            # http://localhost:8000
    python -m sajt.server 8766

`python -m http.server -d docs` ne ume da otvori /mapa (vraća 404), pa za probe treba ovaj.
"""
from __future__ import annotations

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

DOCS = Path(__file__).resolve().parent.parent / "docs"


class Obradjivac(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        put = super().translate_path(path)
        p = Path(put)
        if not p.exists() and not urlsplit(path).path.endswith("/") and p.with_name(p.name + ".html").is_file():
            return str(p.with_name(p.name + ".html"))
        return put

    def send_error(self, code, message=None, explain=None):
        strana = DOCS / "404.html"
        if code == 404 and strana.is_file():   # kao GitHub Pages: 404.html za nepostojeće adrese
            telo = strana.read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(telo)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(telo)
            return
        super().send_error(code, message, explain)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    srv = ThreadingHTTPServer(("", port), partial(Obradjivac, directory=str(DOCS)))
    print(f"http://localhost:{port}/  (docs/, adrese bez .html)")
    srv.serve_forever()


if __name__ == "__main__":
    main()
