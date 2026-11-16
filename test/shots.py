# Phone-size screenshots of every new page, with the fake database. Usage: python3 test/shots.py OUTDIR
import sys, json, asyncio, urllib.parse
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/tt-shots'
import os; os.makedirs(OUT, exist_ok=True)
BASE = 'http://localhost:3000'
log = []
async def route(r):
    u = r.request.url
    if 'supabase.co' in u:
        if '/rpc/submit_memorial' in u:
            body = json.loads(r.request.post_data or '{}'); log.append(('rpc', body))
            return await r.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'id': 'm-test'}))
        if '/rpc/' in u or '/storage/' in u:
            return await r.fulfill(status=200, content_type='application/json', body='{"ok":true}')
        if '/functions/' in u:
            return await r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin':'*'}, body=json.dumps({'items': [], 'memorials': [{'id':'m-1','town':'wapella-sk','name':'Test Person','maiden_name':None,'birth_date_label':'1901','birth_place':None,'death_date_label':'1980','death_place':None,'note':'Loved the garden','source':'Submitted by Ann (daughter) — family Bible','source_url':None,'cemetery_name':'Wapella Cemetery','submission':{'submitter_name':'Ann','submitter_email':'ann@example.com','relationship':'daughter','attestation':'family Bible'}}], 'clippings': []}))
        hdrs = {k: v for k, v in r.request.headers.items() if k.lower() == 'range'}
        resp = await r.request.frame.page.context.request.get(BASE + '/__db?u=' + urllib.parse.quote(u, safe=''), headers=hdrs)
        return await r.fulfill(status=resp.status, content_type='application/json', body=await resp.body())
    if u.startswith(BASE): return await r.continue_()
    return await r.abort()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1)
        await ctx.route('**/*', route)
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        async def shot(name, url, full=False, before=None, wait=1200):
            await pg.goto(BASE + url, wait_until='load'); await pg.wait_for_timeout(wait)
            if before: await before()
            await pg.screenshot(path=f'{OUT}/{name}.png', full_page=full)
        await shot('01-home-top', '/')
        async def to_grow(): await pg.locator('#grow').scroll_into_view_if_needed(); await pg.wait_for_timeout(300)
        await shot('02-home-grow', '/', before=to_grow)
        async def to_rm(): await pg.locator('#tt-rm').scroll_into_view_if_needed(); await pg.wait_for_timeout(400)
        await shot('03-town-remembrance', '/wapella-sk', before=to_rm, wait=2500)
        async def search(): await pg.fill('#tt-rm-q', 'smith'); await pg.wait_for_timeout(300); await pg.locator('#tt-rm').scroll_into_view_if_needed()
        await shot('04-town-rm-search', '/wapella-sk', before=search, wait=2500)
        async def to_cl(): await pg.locator('#tt-cl').scroll_into_view_if_needed(); await pg.wait_for_timeout(400)
        await shot('05-archive-clippings', '/wapella-sk/archive', before=to_cl, wait=2500)
        await shot('06-rem-index-top', '/wapella-sk/remembrance')
        async def to_names(): await pg.fill('#rm-q', 'mac'); await pg.wait_for_timeout(300); await pg.locator('#names').scroll_into_view_if_needed()
        await shot('07-rem-index-search', '/wapella-sk/remembrance', before=to_names)
        await shot('08-memorial', '/wapella-sk/remembrance/wap-0001', full=True)
        await shot('09-memorial-community', '/wapella-sk/remembrance/wap-0011', full=True)
        async def form():
            await pg.locator('#add').scroll_into_view_if_needed()
            await pg.fill('#mf-name', 'Clara Test'); await pg.fill('#mf-src', 'Family Bible'); await pg.fill('#mf-sname', 'Ann'); await pg.fill('#mf-email', 'ann@example.com')
            await pg.click('[data-tt-memform] button[type=submit]'); await pg.wait_for_timeout(600); await pg.locator('#mf-done').scroll_into_view_if_needed()
        await shot('10-family-form-sent', '/wapella-sk/remembrance', before=form)
        await shot('11-province-index', '/province', full=True)
        await shot('12-province-sk', '/province/saskatchewan', full=True)
        await shot('13-province-ns', '/province/nova-scotia')
        async def adm():
            await pg.evaluate("sessionStorage.setItem('tt-admin','x')"); await pg.goto(BASE + '/#admin'); await pg.wait_for_timeout(1500)
            await pg.click('[data-tt=rm-load]'); await pg.wait_for_timeout(600); await pg.locator('#tt-adm').scroll_into_view_if_needed()
        await shot('14-admin-queue', '/', before=adm)
        await pg.set_viewport_size({'width': 1280, 'height': 800})
        async def line(): await pg.evaluate("window.scrollTo(0,0)"); await pg.wait_for_timeout(500)
        await shot('15-desktop-home', '/', before=line, wait=2000)
        print('page errors:', errs or 'none'); print('rpc calls:', log)
        await b.close()
asyncio.run(main())
