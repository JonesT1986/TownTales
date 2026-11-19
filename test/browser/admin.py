import sys, asyncio, json, copy
from playwright.async_api import async_playwright
from common import BASE, make_route
OUT = sys.argv[1]; W = int(sys.argv[2]) if len(sys.argv) > 2 else 390
U = lambda n: '00000000-0000-4000-8000-%012d' % n
items = []
for n,(town,ext,origin) in enumerate([('holbein-sk','link:a','muse'),('holbein-sk','link:b','muse'),('leask-sk','link:c','muse'),('leask-sk',None,'community'),('wapella-sk','link:d','muse'),('holbein-sk',None,'community')]):
    items.append({'id':U(n+1),'town':town,'kind':'document','title':'Fact %d about %s'%(n+1,town),'body':'Body text','date_label':'1905','source':'saskhistory.ca' if ext else '','source_url':'https://x.org/p' if ext else '','contributor':'TownTales link reader' if ext else 'Visitor Vic','origin':origin,'external_id':ext,'status':'pending','contact_email':'' if ext else 'vic@example.com'})
reports = [{'id':'e509f823-bddd-4a0c-aa8b-813c68d943c8','what':'link not working','text':'884\nChurches\n...cant click link','name':'Travis Jones','email':'t@example.com','done':False,'resolved_at':None,'created_at':'2026-10-20T17:01:24Z'},
           {'id':'88d51f1d-b26b-4c00-8e8b-9f576d8a03b6','what':'sfsd','text':'fdxfssd sd sds d','name':'Travis Jones','email':'t@example.com','done':False,'resolved_at':None,'created_at':'2026-10-20T17:07:25Z'}]
state = {'auto': False}
log = []
def fn(u, body):
    a = u.split('?')[0].rstrip('/').split('/')[-1]
    if a == 'queue': return {'items': [i for i in items if i['status']=='pending']}
    if a == 'settings':
        if body.get('set'): state['auto'] = body['set']['auto_approve_link_reader']
        return {'settings': {'auto_approve_link_reader': state['auto']}}
    if a == 'moderate-bulk':
        ch = [i for i in items if i['id'] in body['ids'] and i['status']=='pending']
        for i in ch: i['status'] = body['status']
        return {'ok': True, 'changed': len(ch), 'towns': sorted(set(i['town'] for i in ch))}
    if a == 'moderate':
        for i in items:
            if i['id'] == body.get('item'): i['status'] = body['patch']['status']
        return {'ok': True}
    if a == 'reports':
        return {'reports': [r for r in reports if body.get('show')=='all' or not r['done']]}
    if a == 'report-resolve':
        for r in reports:
            if r['id']==body['id']: r['done']=body['resolved']; r['resolved_at']='2026-11-19T20:00:00Z' if body['resolved'] else None; return {'ok':True,'report':{'id':r['id'],'done':r['done'],'resolved_at':r['resolved_at']}}
    if a == 'report-delete':
        reports[:] = [r for r in reports if r['id']!=body['id']]; return {'ok': True}
    if a == 'links-status': return {'used_today':0,'cap':50,'visitor_links':[]}
    return {'items': []}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': W, 'height': 900}); await ctx.route('**/*', make_route(fn, log))
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(BASE + '/'); await pg.evaluate("sessionStorage.setItem('tt-admin','x')")
        # deep link to a report from the email
        await pg.goto(BASE + '/#admin/report-88d51f1d-b26b-4c00-8e8b-9f576d8a03b6'); await pg.wait_for_timeout(2000)
        print('tabs:', await pg.locator('[role=tab]').all_inner_texts())
        print('focused report:', await pg.locator('.tta-focus h3').all_inner_texts())
        await pg.screenshot(path=f'{OUT}/a1-report-deeplink-{W}.png')
        await pg.click('#tta-report-e509f823-bddd-4a0c-aa8b-813c68d943c8 [data-tta=rep-resolve]'); await pg.wait_for_timeout(400)
        print('msg:', await pg.locator('#tta-msg').inner_text(), '| open left:', len(await pg.locator('.qitem').all()))
        await pg.click('#tta-report-88d51f1d-b26b-4c00-8e8b-9f576d8a03b6 [data-tta=rep-delete]'); await pg.wait_for_timeout(400)
        await pg.check('[data-tta=rep-all]'); await pg.wait_for_timeout(500)
        print('with resolved:', await pg.locator('.qitem h3').all_inner_texts(), await pg.locator('.qitem .pill').all_inner_texts())
        await pg.screenshot(path=f'{OUT}/a2-reports-resolved-{W}.png', full_page=True)
        # deep link to an upload
        await pg.goto(BASE + '/#admin/item-' + U(4)); await pg.wait_for_timeout(2000)
        print('focused item:', await pg.locator('.tta-focus h3').all_inner_texts())
        await pg.screenshot(path=f'{OUT}/a3-item-deeplink-{W}.png')
        # filters
        await pg.select_option('#tta-src', 'link'); await pg.wait_for_timeout(200)
        print('link-reader shown:', len(await pg.locator('.qitem').all()))
        await pg.select_option('#tta-town', 'holbein-sk'); await pg.wait_for_timeout(200)
        print('holbein link-reader shown:', len(await pg.locator('.qitem').all()), await pg.locator('[data-tta=pub-town]').inner_text())
        await pg.screenshot(path=f'{OUT}/a4-filters-{W}.png')
        await pg.click('[data-tta=pub-town]'); await pg.wait_for_timeout(500)
        print('after approve town msg:', await pg.locator('#tta-msg').inner_text())
        await pg.select_option('#tta-town', ''); await pg.select_option('#tta-src', ''); await pg.wait_for_timeout(200)
        print('left total:', len(await pg.locator('.qitem').all()))
        # select two and approve selected
        picks = pg.locator('[data-tta=pick]')
        await picks.nth(0).check(); await pg.wait_for_timeout(150); await pg.locator('[data-tta=pick]').nth(1).check(); await pg.wait_for_timeout(150)
        print('button:', await pg.locator('[data-tta=pub-sel]').inner_text())
        await pg.click('[data-tta=pub-sel]'); await pg.wait_for_timeout(500)
        print('after selected msg:', await pg.locator('#tta-msg').inner_text(), '| left:', len(await pg.locator('.qitem').all()))
        # settings toggle
        await pg.check('[data-tta=auto]'); await pg.wait_for_timeout(500)
        print('auto now:', state['auto'], '|', await pg.locator('#tta-msg').inner_text() if await pg.locator('#tta-msg').count() else '')
        await pg.screenshot(path=f'{OUT}/a5-after-{W}.png', full_page=True)
        print('status:', [(i['town'], i['external_id'], i['status']) for i in items])
        print('api calls:', [c[0] for c in log])
        print('errors:', errs)
        await b.close()
if __name__ == "__main__": asyncio.run(main())
