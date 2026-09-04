"""Live co-op test: host + joiner (+ a refused late joiner) in one headless browser.

Not part of tests/run.py -- it needs a real browser with WebRTC and the public
PeerJS broker. Drives the actual game through window.__dropzone (App) in three
isolated browser contexts and asserts on host/client state after every step:
room code, join, deploy, snapshots, puppets, remote bodies, validated hits, kill
and chest credit, loot grants, routed bot damage, mission end, room return, host
leaving, and that single-player still boots with no session.

    python3 -m http.server 8123 &            # serve the game
    uv venv .pw && uv pip install --python .pw/bin/python playwright
    .pw/bin/playwright install chromium
    .pw/bin/python tests/coop_live.py        # ~40s, exits 1 on any failure

Both windows run on this machine, so it proves the protocol and the authority
split, not NAT traversal. Two machines on different networks is still the final
check (MULTIPLAYER_PLAN.md, "Testing this").
"""
import sys, time, json
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8123/'
results = []


def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('ok   ' if cond else 'FAIL ') + name + (f'  ({detail})' if detail and not cond else ''))


def wait(page, expr, timeout=15000, msg=None):
    try:
        page.wait_for_function(expr, timeout=timeout)
        return True
    except Exception as e:
        print('   timeout waiting for:', msg or expr)
        return False


def ev(page, expr):
    return page.evaluate(expr)


def new_page(ctx, label, errors):
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'[{label}] pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'[{label}] console.{m.type}: {m.text}')
            if m.type in ('error',) else None)
    page.goto(URL)
    ok = wait(page, 'window.__dropzone && window.__dropzone.state', msg=f'{label} app boot')
    return page, ok


def main():
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
            '--autoplay-policy=no-user-gesture-required',
        ])
        host_ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
        join_ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
        late_ctx = browser.new_context(viewport={'width': 1280, 'height': 800})

        host, ok1 = new_page(host_ctx, 'host', errors)
        join, ok2 = new_page(join_ctx, 'join', errors)
        check('both pages boot (WebGL renderer + App)', ok1 and ok2)
        if not (ok1 and ok2):
            print('\n'.join(errors)); sys.exit(1)

        # --- host a room ------------------------------------------------------
        host.click('button:text-is("CO-OP")')
        wait(host, "document.querySelector('.text-input')")
        host.fill('.text-input', 'Hostess')
        host.press('.text-input', 'Tab')
        host.click('button:text-is("HOST A ROOM")')
        got = wait(host, 'window.__dropzone.net && window.__dropzone.net.roomCode', timeout=30000, msg='host session')
        code = ev(host, 'window.__dropzone.net?.roomCode') if got else None
        check('host claims a room code', got and code and len(code) == 4, str(code))
        check('room code rendered on screen', got and host.locator('.room-code').inner_text().strip() == code)
        if not got:
            print('\n'.join(errors)); sys.exit(1)

        # --- join it ----------------------------------------------------------
        join.click('button:text-is("CO-OP")')
        wait(join, "document.querySelector('.text-input.code')")
        join.fill('.text-input:not(.code)', 'Joiner')
        join.press('.text-input:not(.code)', 'Tab')
        join.fill('.text-input.code', code.lower())  # sloppy case on purpose
        join.click('button:text-is("JOIN")')
        got = wait(join, 'window.__dropzone.net && window.__dropzone.net.players.length === 2', timeout=30000, msg='join session')
        check('joiner connects with lower-case code', got)
        wait(host, 'window.__dropzone.net.players.length === 2', msg='host sees joiner')
        hp = ev(host, 'window.__dropzone.net.players.map(p => [p.name, p.host])')
        jp = ev(join, 'window.__dropzone.net.players.map(p => [p.name, p.host])')
        check('both see the same two players, host first', hp == jp == [['Hostess', True], ['Joiner', False]], f'{hp} vs {jp}')
        check('host screen lists two players', host.locator('.player-row:not(.empty)').count() == 2)
        check('joiner sees waiting message', 'Waiting for Hostess' in join.locator('.coop-body').inner_text())
        check('joiner has no mission picker', join.locator('button:text-is("DEPLOY SQUAD")').count() == 0)

        # --- deploy -----------------------------------------------------------
        host.locator('button:text-is("DEPLOY SQUAD")').first.click()
        h_match = wait(host, "window.__dropzone.state.current === 'MATCH' && window.__dropzone.match", msg='host in match')
        j_match = wait(join, "window.__dropzone.state.current === 'MATCH' && window.__dropzone.match", timeout=20000, msg='joiner in match')
        check('host deploys into MATCH', h_match)
        check('joiner is deployed by the START message', j_match)
        if not (h_match and j_match):
            print('\n'.join(errors)); sys.exit(1)
        check('host is authority, joiner is not',
              ev(host, 'window.__dropzone.match.isAuthority') is True and ev(join, 'window.__dropzone.match.isAuthority') is False)
        check('joiner loot system is in client mode', ev(join, 'window.__dropzone.match.loot.authority') is False)
        same_map = ev(host, 'window.__dropzone.match.arena.chestSpots.map(v => [v.x, v.z])') == \
                   ev(join, 'window.__dropzone.match.arena.chestSpots.map(v => [v.x, v.z])')
        check('both peers built an identical arena from the seed', same_map)

        # --- late join is refused while the mission runs ---------------------
        late, ok3 = new_page(late_ctx, 'late', errors)
        late.click('button:text-is("CO-OP")')
        wait(late, "document.querySelector('.text-input.code')")
        late.fill('.text-input.code', code)
        late.click('button:text-is("JOIN")')
        got = wait(late, "window.__dropzone.netError && window.__dropzone.netError.length > 0", timeout=30000, msg='late join error')
        err = ev(late, 'window.__dropzone.netError')
        check('late joiner refused with a readable reason', got and 'in progress' in (err or ''), str(err))
        check('room stays at 2 players', ev(host, 'window.__dropzone.net.players.length') == 2)

        # --- world flows host -> client --------------------------------------
        got = wait(host, 'window.__dropzone.match.enemies.length > 0', timeout=20000, msg='host spawns bots')
        check('host spawns bots while paused (co-op keeps the world running)', got)
        got = wait(join, 'window.__dropzone.match.enemies.length > 0', timeout=20000, msg='client puppets')
        check('client receives snapshots and builds puppet bots', got)
        check('client has a snapshot buffer', ev(join, 'window.__dropzone.match.coop.snapshots.buffer.length') > 0)
        wait(host, 'window.__dropzone.match.coop.remotes.size === 1 && [...window.__dropzone.match.coop.remotes.values()][0].body', timeout=20000, msg='host remote body')
        check('host shows the joiner as a remote body', ev(host, '[...window.__dropzone.match.coop.remotes.values()].some(r => !!r.body)'))
        wait(join, 'window.__dropzone.match.coop.remotes.size === 1 && [...window.__dropzone.match.coop.remotes.values()][0].body', timeout=20000, msg='client remote body')
        check('client shows the host as a remote body', ev(join, '[...window.__dropzone.match.coop.remotes.values()].some(r => !!r.body)'))
        h_ids = set(ev(host, 'window.__dropzone.match.enemies.map(e => e.id)'))
        j_ids = set(ev(join, 'window.__dropzone.match.enemies.map(e => e.id)'))
        check('client bot ids are a subset of the host\'s', j_ids <= h_ids and len(j_ids) > 0, f'{j_ids} vs {h_ids}')

        # --- client hit -> host validates -> KILL back -----------------------
        target = ev(join, 'window.__dropzone.match.enemies.find(e => e.alive)?.id')
        ev(join, f"""(() => {{ const m = window.__dropzone.match; const e = m.enemies.find(x => x.id === {target});
            const r = m.coop.clientHit(e, 5000, true); return r; }})()""")
        got = wait(host, f"!window.__dropzone.match.enemies.find(e => e.id === {target})?.alive", msg='host kills bot')
        check('host applies the client\'s hit and kills the bot', got)
        got = wait(join, 'window.__dropzone.match.stats.kills === 1', msg='client kill credit')
        check('client is credited the kill via KILL', got)
        check('host does not take the credit', ev(host, 'window.__dropzone.match.stats.kills') == 0)
        check('host objective advanced', ev(host, 'window.__dropzone.match.objectives.entries[0].current') == 1)
        got = wait(join, "window.__dropzone.match.coop.objectives && window.__dropzone.match.coop.objectives[0].text === '1/8'", msg='client objective view')
        check('client objective view mirrors the host (1/8)', got)
        # A second hit on the dead bot must be ignored (no double count).
        ev(join, f"""(() => {{ const m = window.__dropzone.match; const e = m.enemies.find(x => x.id === {target});
            if (e) m.net_dummy = m.coop.clientHit(e, 5000, true); m.coop.net.send('eh', {{ e: {target}, d: 5000, h: 1 }}); }})()""")
        time.sleep(1.0)
        check('re-hitting a dead bot does not double count', ev(host, 'window.__dropzone.match.objectives.entries[0].current') == 1)

        # --- chest: client asks, host opens, loot spawns for both ------------
        ev(join, 'window.__dropzone.match.loot.openChest(window.__dropzone.match.loot.chests[0])')
        got = wait(host, 'window.__dropzone.match.loot.chests[0].opened', msg='host opens chest')
        check('host opens the chest the client asked for', got)
        got = wait(join, 'window.__dropzone.match.loot.chests[0].opened && window.__dropzone.match.stats.chests === 1', msg='client chest done')
        check('client gets CHEST_DONE and the credit', got)
        check('host does not take the chest credit', ev(host, 'window.__dropzone.match.stats.chests') == 0)
        n_host = ev(host, 'window.__dropzone.match.loot.pickups.length')
        got = wait(join, f'window.__dropzone.match.loot.pickups.length >= {max(n_host, 1)}', msg='client pickups')
        n_join = ev(join, 'window.__dropzone.match.loot.pickups.length')
        check('chest loot exists on both peers with matching ids',
              got and set(ev(host, 'window.__dropzone.match.loot.pickups.map(p => p.id)')) ==
              set(ev(join, 'window.__dropzone.match.loot.pickups.map(p => p.id)')), f'host {n_host} join {n_join}')

        # --- client picks up an ammo drop (LOOT_TAKE -> LOOT_GONE) ----------
        pid = ev(join, "window.__dropzone.match.loot.pickups.find(p => p.payload.kind === 'ammo')?.id")
        ammo_before = ev(join, "Object.values(window.__dropzone.match.inventory.ammo).reduce((a,b)=>a+b,0)")
        ev(join, f"""(() => {{ const m = window.__dropzone.match; const p = m.loot.pickupById({pid});
            p.age = 5; m.player.pos.copy(p.mesh.position); }})()""")
        got = wait(join, f'!window.__dropzone.match.loot.pickupById({pid})', msg='client pickup resolved')
        ammo_after = ev(join, "Object.values(window.__dropzone.match.inventory.ammo).reduce((a,b)=>a+b,0)")
        check('client walks onto ammo, host grants it, client receives it', got and ammo_after > ammo_before, f'{ammo_before}->{ammo_after}')
        check('pickup removed on the host too', ev(host, f'!window.__dropzone.match.loot.pickupById({pid})'))

        # --- bot damage routed to the remote player --------------------------
        jid = ev(join, 'window.__dropzone.net.localId')
        ev(host, f"window.__dropzone.match._onPlayerDamaged(10, new (window.__dropzone.match.player.pos.constructor)(1,0,1), '{jid}')")
        got = wait(join, 'window.__dropzone.match.player.health === 90', msg='client hurt')
        check('host routes bot damage to the client (PLAYER_HURT)', got)
        check('host health untouched', ev(host, 'window.__dropzone.match.player.health') == 100)

        # --- mission end propagates ------------------------------------------
        ev(host, 'window.__dropzone.match.finish(true)')
        wait(host, "window.__dropzone.state.current === 'RESULTS'")
        got = wait(join, "window.__dropzone.state.current === 'RESULTS'", msg='client results')
        check('host finish(true) ends the mission for the client', got)
        check('client result is a success (it was alive)', ev(join, 'window.__dropzone.result.success') is True)
        check('client result carries the host objective view', ev(join, "window.__dropzone.result.objectives[0].text") == '1/8')
        check('client result credits its kill and chest',
              ev(join, 'window.__dropzone.result.kills') == 1 and ev(join, 'window.__dropzone.result.chests') == 1)
        check('results keep the session alive', ev(host, '!!window.__dropzone.net') and ev(join, '!!window.__dropzone.net'))
        check('joiner has no REDEPLOY buttons', join.locator('button:has-text("REDEPLOY")').count() == 0)
        check('host has REDEPLOY SQUAD', host.locator('button:text-is("REDEPLOY SQUAD")').count() == 1)

        # --- back to the room, then host leaves ------------------------------
        host.click('button:text-is("CONTINUE")')
        join.click('button:text-is("CONTINUE")')
        wait(host, "window.__dropzone.state.current === 'MULTIPLAYER'")
        wait(join, "window.__dropzone.state.current === 'MULTIPLAYER'")
        check('CONTINUE returns both to the room', host.locator('.room-code').count() == 1 and join.locator('.room-code').count() == 1)
        check('room unlocked again for joins', ev(host, 'window.__dropzone.net.roster.locked') is False)

        host.click('button:text-is("LEAVE ROOM")')
        got = wait(join, "window.__dropzone.net === null && window.__dropzone.state.current === 'LOBBY'", msg='client kicked to lobby')
        check('host leaving sends the client to its lobby', got)
        check('host session closed', ev(host, 'window.__dropzone.net') is None)

        # --- single-player still works with no session -----------------------
        host.click('button:text-is("← BACK")')
        wait(host, "window.__dropzone.state.current === 'LOBBY'")
        host.click('button:text-is("DEPLOY")')
        host.locator('.mission-foot .btn').first.click()
        got = wait(host, "window.__dropzone.state.current === 'MATCH' && window.__dropzone.match && window.__dropzone.match.coop === null")
        check('single-player match starts with coop === null', got)
        ev(host, 'window.__dropzone.match.setPaused(false)')  # no pointer lock in headless: SP stays frozen
        time.sleep(1.0)
        check('single-player stays frozen without pointer lock (unchanged behaviour)', ev(host, 'window.__dropzone.match.enemies.length') == 0)

        browser.close()

    print()
    bad = [r for r in results if not r[1]]
    print(f'{len(results) - len(bad)}/{len(results)} checks passed')
    real_errors = [e for e in errors if 'favicon' not in e]
    if real_errors:
        print('\nbrowser errors:')
        for e in real_errors[:40]: print('  ' + e)
    sys.exit(1 if bad or real_errors else 0)


if __name__ == '__main__':
    main()
