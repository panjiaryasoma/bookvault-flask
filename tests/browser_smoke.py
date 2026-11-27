"""Real Chromium integration: fake camera streams an actual generated EAN-13 barcode,
OCR runs on an actual generated cover image, and all saves use Flask/SQLite.
External metadata is stubbed to keep this test deterministic."""
import base64
import json
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE="http://127.0.0.1:8000"
OUT=Path("browser-evidence")
OUT.mkdir(exist_ok=True)

def camera_fixture(path):
    left=["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"]
    even=["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"]
    parity=["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"]
    digits="9780140328721"
    pattern="101"+"".join((left if p=="L" else even)[int(d)] for p,d in zip(parity[int(digits[0])],digits[1:7]))+"01010"+"".join("".join("1" if b=="0" else "0" for b in left[int(d)]) for d in digits[7:])+"101"
    width,height=640,480
    bars=bytes([235])*82+b"".join(bytes([16 if b=="1" else 235])*5 for b in pattern)+bytes([235])*(width-82-len(pattern)*5)
    row=bytes([235])*width
    frame=row*140+bars*200+row*140+bytes([128])*(width*height//2)
    with path.open("wb") as f:
        f.write(b"YUV4MPEG2 W640 H480 F10:1 Ip A1:1 C420jpeg\n")
        for _ in range(40):f.write(b"FRAME\n"+frame)

for _ in range(40):
    try:
        urllib.request.urlopen(BASE+"/api/health",timeout=1).close();break
    except Exception:time.sleep(.5)
else:raise RuntimeError("Server did not start")

cam=Path("/tmp/bookvault-camera.y4m")
camera_fixture(cam)
with sync_playwright() as p:
    browser=p.chromium.launch(args=["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream",f"--use-file-for-fake-video-capture={cam}"])
    ctx=browser.new_context(viewport={"width":390,"height":844},permissions=["camera"],color_scheme="dark",accept_downloads=True)
    page=ctx.new_page()
    errors=[]
    page.on("pageerror",lambda error:errors.append(str(error)))
    page.goto(BASE+"/register")
    page.locator("[name=username]").fill("browser-user")
    page.locator("[name=password]").fill("browser-password-123")
    page.locator("[name=confirm_password]").fill("browser-password-123")
    page.locator("form button[type=submit]").click()
    expect(page).to_have_url(BASE+"/login")
    page.locator("[name=username]").fill("browser-user")
    page.locator("[name=password]").fill("browser-password-123")
    page.locator("form button[type=submit]").click()
    expect(page).to_have_url(BASE+"/user/dashboard")
    page.goto(BASE+"/library/scan")
    expect(page.locator("#copy-form")).to_be_visible()
    seen=[]
    def metadata(route):
        body=route.request.post_data_json
        seen.append(body)
        route.fulfill(json={"results":[{"title":"The Scanner Test","author":"Test Author","isbn":body.get("isbn",""),"genre":"Literary Fiction","year":"2000","publisher":"Test Press","source":"Test metadata"}]})
    page.route("**/library/lookup",metadata)
    page.locator("#start-camera").click()
    expect(page.locator("#lookup-isbn")).to_have_value("9780140328721",timeout=25000)
    expect(page.locator(".scan-result")).to_have_count(1,timeout=10000)
    assert seen[0]["isbn"]=="9780140328721"
    expect(page.locator("#scan-frame")).to_be_hidden()
    page.locator(".scan-result").click()
    expect(page.locator("[name=title]")).to_have_value("The Scanner Test")
    page.screenshot(path=str(OUT/"scanner-mobile-dark.png"),full_page=True)
    page.locator("#save-next").click()
    expect(page.locator("#save-status")).to_contain_text("Tersimpan")
    expect(page.locator("[name=title]")).to_have_value("")
    # Generate a clear cover, pass its actual PNG through the real OCR worker.
    png=page.evaluate("""() => {
      const c=document.createElement('canvas'); c.width=1200;c.height=800;
      const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1200,800);
      x.fillStyle='black';x.textAlign='center';x.font='bold 100px sans-serif';
      x.fillText('GERMINAL',600,330);x.font='64px sans-serif';x.fillText('EMILE ZOLA',600,480);
      return c.toDataURL('image/png').split(',')[1];
    }""")
    page.locator("#cover-file").set_input_files({"name":"cover.png","mimeType":"image/png","buffer":base64.b64decode(png)})
    expect(page.locator("#scan-status")).to_contain_text("OCR selesai",timeout=90000)
    assert "GERMINAL" in page.locator("#lookup-query").input_value().upper()
    assert "ZOLA" in page.locator("#lookup-query").input_value().upper()
    page.locator("[name=title]").fill("Germinal")
    page.locator("[name=author]").fill("Émile Zola")
    page.locator("[name=genre]").select_option("Literary Fiction")
    page.locator("[name=tags]").fill("Naturalisme, kritik sosial")
    page.locator("#save-copy").click()
    expect(page).to_have_url(BASE+"/library/")
    expect(page.locator(".copy-row")).to_have_count(2)
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
    page.screenshot(path=str(OUT/"collection-mobile-dark.png"),full_page=True)
    page.locator("#theme-toggle").click()
    assert page.locator("html").get_attribute("data-theme")=="light"
    page.screenshot(path=str(OUT/"collection-mobile-light.png"),full_page=True)
    page.set_viewport_size({"width":1440,"height":900})
    page.screenshot(path=str(OUT/"collection-desktop-light.png"),full_page=True)
    page.locator("[name=q]").fill("Naturalisme")
    page.locator(".library-filter button").click()
    expect(page.locator(".copy-row")).to_have_count(1)
    expect(page.locator(".copy-row")).to_contain_text("Germinal")
    page.locator(".copy-row .archive-link").click()
    expect(page.locator("[name=title]")).to_have_value("Germinal")
    page.locator("[name=status]").select_option("finished")
    page.locator("#save-copy").click()
    expect(page).to_have_url(BASE+"/library/")
    expect(page.locator(".copy-row")).to_have_count(2)
    response=ctx.request.get(BASE+"/library/export")
    assert response.ok and len(response.json())==2
    assert any(x["title"]=="Germinal" and x["status"]=="finished" for x in response.json())
    assert not errors,errors
    browser.close()
print("Browser integration passed: real ZXing barcode, real Tesseract OCR, authentication, batch save, filtering, editing, export, responsive light/dark.")
