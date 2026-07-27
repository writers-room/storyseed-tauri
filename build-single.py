#!/usr/bin/env python3
"""
index.html + styles.css + JS → index-단일파일.html 로 합칩니다.

부수 작업으로 index.html의 styles.css / script_*.js 링크에 ?v=... 를 붙입니다.
GitHub Pages는 CSS·JS를 오래 캐시해서, 파일을 올려도 브라우저가 예전 것을
계속 쓰는 일이 생깁니다. 이 스크립트를 실행할 때마다 버전이 갱신되므로
배포 전에 한 번 돌려주면 캐시 문제가 사라집니다.

파일을 수정한 뒤 이 스크립트를 다시 실행하면 단일 파일 버전이 갱신됩니다.
    python3 build-single.py

각 JS는 원본과 동일한 스코프를 유지하려고 개별 <script> 블록으로 넣습니다.
(하나로 합치면 파일별 최상위 let/const가 서로 충돌해 전부 죽습니다.)
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ORDER = [
    "fortune_data.js", "script_core.js", "script_ui.js",
    "script_chat.js", "script_data.js", "script_realtime.js",
    "script_profile.js", "script_reactions.js", "script_manual.js",
]
OUT = "index-단일파일.html"


def read(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return f.read()


def stamp_versions():
    """index.html의 에셋 링크에 ?v=<타임스탬프>를 붙이거나 갱신합니다."""
    import time
    ver = time.strftime("%Y%m%d%H%M")
    path = os.path.join(HERE, "index.html")
    with open(path, encoding="utf-8") as f:
        html = f.read()

    def bump(m):
        return '%s="%s?v=%s"' % (m.group(1), m.group(2), ver)

    new = re.sub(
        r'(href|src)="(styles\.css|fortune_data\.js|script_[\w]+\.js)(?:\?v=[\w]+)?"',
        bump, html
    )
    if new != html:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new)
    print("에셋 버전 스탬프: ?v=%s" % ver)
    return new


def main():
    html = stamp_versions()

    # 1) CSS 인라인 (?v= 가 붙어 있어도 잡히도록)
    link = re.search(r'<link rel="stylesheet" href="styles\.css[^"]*" />', html)
    link = link.group(0) if link else '<link rel="stylesheet" href="styles.css" />'
    if link not in html:
        sys.exit("index.html에서 styles.css link 태그를 찾지 못했어요.")
    html = html.replace(link, "<style>\n" + read("styles.css") + "\n</style>")

    # 2) JS 인라인 — 문자열 슬라이싱으로 교체.
    #    re.sub를 쓰면 JS 안의 \p 같은 이스케이프가 치환 템플릿으로 해석돼 깨집니다.
    m_first = re.search(r'<script src="%s[^"]*"></script>' % re.escape(ORDER[0]), html)
    m_last = re.search(r'<script src="%s[^"]*"></script>' % re.escape(ORDER[-1]), html)
    if not m_first or not m_last:
        sys.exit("index.html에서 script 태그 블록을 찾지 못했어요.")

    start = m_first.start()
    end = m_last.end()

    block = "\n".join(
        "<script>\n/* ===== %s ===== */\n%s\n</script>" % (n, read(n))
        for n in ORDER
    )
    html = html[:start] + block + html[end:]

    # 3) 외부 참조가 남았는지 확인 (firebase CDN과 data: URI는 정상)
    #    JS 템플릿 문자열 안의 src="${...}" 는 런타임 값이므로 제외합니다.
    leftover = [
        u for u in re.findall(r'(?:src|href)="([^"]+)"', html)
        if not u.startswith(("https://", "data:")) and "${" not in u
    ]
    if leftover:
        sys.exit("인라인되지 않은 외부 참조가 남았어요: %s" % leftover)

    with open(os.path.join(HERE, OUT), "w", encoding="utf-8") as f:
        f.write(html)

    print("%s 생성 완료 (%s bytes, script 블록 %d개)"
          % (OUT, format(len(html), ","), html.count("<script>")))


if __name__ == "__main__":
    main()
