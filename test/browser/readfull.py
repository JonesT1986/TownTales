import asyncio
from playwright.async_api import async_playwright
from common import BASE, make_route
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}); await ctx.route('**/*', make_route())
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE + '/whitewood-sk'); await pg.wait_for_timeout(2500)
        for c in await pg.locator('article.tick').all():
            print('card:', (await c.locator('h3').inner_text())[:40], '| readfull:', await c.locator('.readfull a').count(), '| from:', await c.locator('.from a').count())
        first = pg.locator('article.tick').first
        await first.locator('.more').click(); await pg.wait_for_timeout(200)
        link = first.locator('.from a').first
        await link.click(); await pg.wait_for_timeout(1500)
        print('item url:', pg.url, '| card self links:', await pg.locator('#view article.tick .from a, #view article.tick .readfull a').count())
        await pg.go_back(); await pg.wait_for_timeout(1500); print('back:', pg.url)
        print('errors:', errs); await b.close()
asyncio.run(main())
