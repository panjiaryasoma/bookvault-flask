"""Real Chromium integration: synthetic EAN-13 video and generated cover, no external APIs."""
import base64
import os
import re
import tempfile
import threading
from pathlib import Path
from unittest.mock import patch
from playwright.sync_api import sync_playwright, expect
from werkzeug.serving import make_server

ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
temp=tempfile.TemporaryDirectory()
tmp=Path(temp.name)
os.environ["DATABASE_URL"]="sqlite:///"+str(tmp/"browser_test.db")
os.environ["BOOKVAULT_SECRET_KEY"]="browser-only-test-"+"x"*40
os.environ["BOOKVAULT_API_KEY"]="browser-test-key"
os.environ["BOOKVAULT_SECURE_COOKIES"]="0"
os.environ["BOOKVAULT_TRUSTED_HOSTS"]=""
import sys
sys.path.insert(0,str(ROOT))
from app import app, db, User

ISBN="9780306406157"
def fake_barcode_video(path):
    # EAN13 uses six left digits, six right digits and parity determined by first digit.
    left=["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"]
    comp=lambda s:"".join("1" if c=="0" else "0" for c in s)
    parity=["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"][int(ISBN[0])]
    modules="101"+"".join(left[int(d)] if p=="L" else comp(left[int(d)])[::-1] for d,p in zip(ISBN[1:7],parity))+"01010"+"".join(comp(left[int(d)]) for d in ISBN[7:])+"101"
    assert len(modules)==95
    w,h=640,480
    y=bytearray([235])*(w*h)
    for i,bit in enumerate(modules):
        if bit=="1":
            start=(w-95*4)//2+i*4
            for row in range(120,360):
                y[row*w+start:row*w+start+4]=b"\x10"*4
    frame=bytes(y)+bytes([128])*(w*h//2)
    with path.open("wb") as f:
        f.write(b"YUV4MPEG2 W640 H480 F30:1 Ip A1:1 C420jpeg\n")
        for _ in range(30):f.write(b"FRAME\n"+frame)

def lookup_stub(query,key):
    if query==ISBN:
        return ([dict(title="Physics Edition",author="Test Author",isbn=ISBN,publisher="Test Press",year="1980",pages="123",language="en",cover="",tags=["Sains"],source="Test ISBN",subjects=[])],[])
    if "CRIME" in query.upper():
        return ([dict(title="Crime and Punishment",author="Fyodor Dostoevsky",isbn="",publisher="",year="",pages="",language="",cover="",tags=["Fiksi","Sastra"],source="Test work",subjects=[])],[])
    return ([dict(title='<img src=x onerror="window.__xss=1">',author="Hostile metadata",isbn="",cover="",tags=[],source="Test hostile")],[])

def main():
    with app.app_context():
        db.create_all()
        u=User(username="reader",role="user")
        u.set_password("ReaderPassword123!")
        db.session.add(u);db.session.commit()
    video=tmp/"barcode.y4m"
    fake_barcode_video(video)
    server=make_server("127.0.0.1",0,app,threaded=True)
    origin=f"http://127.0.0.1:{server.server_port}"
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        with patch("library_routes.lookup",side_effect=lookup_stub), sync_playwright() as p:
            browser=p.chromium.launch(headless=True,args=["--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream",f"--use-file-for-fake-video-capture={video}"])
            context=browser.new_context(viewport={"width":393,"height":873},is_mobile=True,has_touch=True,permissions=["camera"],color_scheme="dark")
            page=context.new_page()
            page.set_default_timeout(15000)
            requests=[]
            page.on("request",lambda req:requests.append(req.url))
            page.goto(origin+"/login")
            page.locator('input[name="username"]').fill("reader")
            page.locator('input[name="password"]').fill("ReaderPassword123!")
            page.get_by_role("button",name="Sign in").click()
            page.wait_for_url("**/user/dashboard")
            page.goto(origin+"/user/library/scan")
            expect(page.locator("html")).to_have_attribute("data-theme","dark")
            page.locator("#theme-toggle").click()
            expect(page.locator("html")).to_have_attribute("data-theme","light")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"),"Mobile overflow"
            # Actual camera pipeline; only metadata HTTP is mocked.
            page.locator("#start-camera").click()
            expect(page.locator("#lookup-query")).to_have_value(ISBN,timeout=30000)
            expect(page.get_by_role("button",name="Pilih hasil")).to_be_visible(timeout=20000)
            assert page.locator("#camera-preview").evaluate("el=>el.srcObject===null"),"Camera not released"
            page.get_by_role("button",name="Pilih hasil").click()
            expect(page.locator('input[name="isbn"]')).to_have_value(ISBN)
            expect(page.locator('input[name="title"]')).to_have_value("Physics Edition")
            page.get_by_role("button",name="Simpan eksemplar").click()
            page.wait_for_url("**/user/library")
            expect(page.get_by_role("heading",name="Physics Edition")).to_be_visible()
            print("PASS: Chromium camera decoded synthetic EAN-13, stopped stream, fetched metadata and saved")
            page.goto(origin+"/user/library/scan")
            # Generate high-contrast book cover image in browser; perform actual WASM OCR.
            url=page.evaluate("""() => { const c=document.createElement('canvas');c.width=1100;c.height=500;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='black';x.font='bold 65px sans-serif';x.textAlign='center';x.fillText('CRIME AND PUNISHMENT',550,180);x.font='48px sans-serif';x.fillText('FYODOR DOSTOEVSKY',550,300);return c.toDataURL('image/png'); }""")
            image=base64.b64decode(url.split(",",1)[1])
            page.locator("#cover-file").set_input_files({"name":"synthetic-cover.png","mimeType":"image/png","buffer":image})
            page.locator("#ocr-button").click()
            expect(page.locator("#lookup-query")).to_have_value(re.compile(r"CRIME\s+AND\s+PUNISHMENT",re.I),timeout=120000)
            page.locator("#lookup-form button").click()
            expect(page.get_by_role("button",name="Pilih hasil")).to_be_visible()
            # Old ISBN cannot survive selecting a work without an ISBN.
            page.locator('input[name="isbn"]').fill(ISBN)
            page.get_by_role("button",name="Pilih hasil").click()
            expect(page.locator('input[name="isbn"]')).to_have_value("")
            expect(page.locator('input[name="title"]')).to_have_value("Crime and Punishment")
            print("PASS: browser WASM OCR recognized synthetic English cover and cleared stale edition metadata")
            page.locator("#lookup-query").fill("hostile test")
            page.locator("#lookup-form button").click()
            expect(page.get_by_role("button",name="Pilih hasil")).to_be_visible()
            assert page.locator("#lookup-results img").count()==0
            assert page.evaluate("window.__xss===undefined")
            assert not any(not (u.startswith(origin) or u.startswith("data:") or u.startswith("blob:")) for u in requests),"Unexpected cross-origin browser traffic"
            print("PASS: hostile metadata rendered as text; scanner requests remained same-origin")
            # Visual regression artifacts: existing style, not a new visual system.
            out=ROOT/"test-artifacts";out.mkdir(exist_ok=True)
            page.goto(origin+"/user/library")
            page.screenshot(path=str(out/"collection-mobile-light.png"),full_page=True)
            page.locator("#theme-toggle").click()
            page.screenshot(path=str(out/"collection-mobile-dark.png"),full_page=True)
            page.set_viewport_size({"width":1280,"height":900})
            page.screenshot(path=str(out/"collection-desktop-dark.png"),full_page=True)
            context.close();browser.close()
    finally:
        server.shutdown();thread.join(timeout=5)
        temp.cleanup()

if __name__=="__main__":
    main()
