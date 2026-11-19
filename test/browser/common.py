import json, urllib.parse
BASE = 'http://localhost:3000'
def make_route(fn_handler=None, log=None):
    async def route(r):
        u = r.request.url
        if 'supabase.co' in u:
            if '/functions/' in u:
                if fn_handler:
                    res = fn_handler(u, json.loads(r.request.post_data or '{}'))
                    if log is not None: log.append((u.split('/')[-1], json.loads(r.request.post_data or '{}')))
                    return await r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin':'*'}, body=json.dumps(res))
                return await r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin':'*'}, body='{"items":[]}')
            if '/rpc/' in u or '/storage/' in u:
                return await r.fulfill(status=200, content_type='application/json', body='{"ok":true}')
            if r.request.method != 'GET':
                return await r.fulfill(status=201, content_type='application/json', body='[]')
            hdrs = {k: v for k, v in r.request.headers.items() if k.lower() == 'range'}
            resp = await r.request.frame.page.context.request.get(BASE + '/__db?u=' + urllib.parse.quote(u, safe=''), headers=hdrs)
            return await r.fulfill(status=resp.status, content_type='application/json', body=await resp.body())
        if u.startswith(BASE): return await r.continue_()
        return await r.abort()
    return route
