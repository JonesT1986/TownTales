import sys, asyncio
from playwright.async_api import async_playwright
from common import BASE, make_route
OUT = sys.argv[1]; W = int(sys.argv[2]) if len(sys.argv) > 2 else 390
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': W, 'height': 844}); await ctx.route('**/*', make_route())
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE + '/whitewood-sk'); await pg.wait_for_timeout(2500)
        card = pg.locator('article.tick').first
        await card.scroll_into_view_if_needed(); await pg.screenshot(path=f'{OUT}/card-closed-{W}.png')
        stub = card.locator('.stub span').first
        print('stub text:', repr(await stub.inner_text()), 'box:', await stub.bounding_box(), 'scrollW/clientW:', await stub.evaluate('e=>[e.scrollWidth,e.clientWidth, getComputedStyle(e).overflow, getComputedStyle(e.parentElement).width]'))
        more = card.locator('.more')
        print('Read tag:', await more.evaluate('e=>e.outerHTML'))
        await more.click(); await pg.wait_for_timeout(300)
        print('open after Read click:', await card.locator('details').evaluate('e=>e.open'))
        await pg.screenshot(path=f'{OUT}/card-open-{W}.png')
        link = card.locator('.from a').first
        print('archive href:', await link.get_attribute('href'))
        await link.click(); await pg.wait_for_timeout(1500)
        print('after archive click url:', pg.url, '| h1:', await pg.locator('#view h1').first.inner_text())
        await pg.screenshot(path=f'{OUT}/after-archive-click-{W}.png')
        print('errors:', errs)
        await b.close()
asyncio.run(main())
