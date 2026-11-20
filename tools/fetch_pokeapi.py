#!/usr/bin/env python3
"""전국도감 1~1025 포켓몬 데이터 수집 (PokeAPI) → data/pokedex.json

- species / pokemon / evolution-chain / move / type 를 병렬로 받아 로컬 캐시에 저장
- 앱에 필요한 것만 추려 가벼운 JSON 으로 만듭니다.
사용: python3 tools/fetch_pokeapi.py [--cache /tmp/pokecache] [--out data/pokedex.json]
"""
import argparse, json, os, re, sys, time, unicodedata
import urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

API = 'https://pokeapi.co/api/v2/'
MAX_ID = 1025
WORKERS = 24

VG_ORDER = ['scarlet-violet', 'the-teal-mask', 'the-indigo-disk', 'legends-arceus',
            'brilliant-diamond-shining-pearl', 'legends-arceus',
            'sword-shield', 'the-isle-of-armor', 'the-crown-tundra',
            'ultra-sun-ultra-moon', 'omega-ruby-alpha-sapphire', 'x-y',
            'black-2-white-2', 'black-white', 'heartgold-soulsilver', 'platinum',
            'diamond-pearl', 'emerald', 'firered-leafgreen', 'ruby-sapphire',
            'crystal', 'gold-silver', 'yellow', 'red-blue']


def http_json(url, tries=4):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'damoa-pokedex/1.0'})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:            # noqa: BLE001
            last = e
            time.sleep(0.6 * (i + 1) + (i * 0.3))
    raise RuntimeError('failed %s: %s' % (url, last))


def cache_path(cache, kind, key):
    d = os.path.join(cache, kind)
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, '%s.json' % key)


def get_cached(cache, kind, key):
    p = cache_path(cache, kind, key)
    if os.path.exists(p):
        try:
            with open(p, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:                 # noqa: BLE001
            pass
    url = API + kind + '/' + str(key)
    data = http_json(url)
    tmp = p + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f)
    os.replace(tmp, p)
    return data


def clean(s):
    if not s:
        return ''
    s = s.replace('\u00ad', '').replace('\u200b', '')
    s = s.replace('\n', ' ').replace('\r', ' ').replace('\f', ' ').replace('\u0000', '')
    s = unicodedata.normalize('NFC', s)
    return re.sub(r'\s+', ' ', s).strip()


def pick_ko(entries, key='name'):
    ko = [e for e in entries if (e.get('language') or {}).get('name') == 'ko']
    if ko:
        return clean(ko[-1].get(key))
    en = [e for e in entries if (e.get('language') or {}).get('name') == 'en']
    return clean(en[-1].get(key)) if en else ''


def version_rank(v):
    try:
        return -VG_ORDER.index(v)
    except ValueError:
        return -999


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', '.cache', 'pokeapi'))
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'pokedex.json'))
    args = ap.parse_args()
    cache = args.cache
    t0 = time.time()

    ids = list(range(1, MAX_ID + 1))

    def job(i):
        return (get_cached(cache, 'pokemon', i), get_cached(cache, 'pokemon-species', i))

    species_raw, pokemon_raw = {}, {}
    done = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(job, i): i for i in ids}
        for fu in as_completed(futs):
            i = futs[fu]
            p, s = fu.result()
            pokemon_raw[i] = p
            species_raw[i] = s
            done += 1
            if done % 100 == 0:
                print('  ... %d/%d (%.0fs)' % (done, MAX_ID, time.time() - t0), flush=True)
    print('pokemon+species done %.1fs' % (time.time() - t0), flush=True)

    # ---- 진화 체인 ----
    chain_ids = {}
    for i in ids:
        u = ((species_raw[i].get('evolution_chain') or {}).get('url') or '')
        if u:
            chain_ids[int(u.rstrip('/').split('/')[-1])] = 1
    chains = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(get_cached, cache, 'evolution-chain', cid): cid for cid in chain_ids}
        for fu in as_completed(futs):
            cid = futs[fu]
            chains[cid] = fu.result()
    print('evolution chains: %d (%.1fs)' % (len(chains), time.time() - t0), flush=True)

    # ---- 기술 이름/설명 ----
    move_names = set()
    for i in ids:
        for m in pokemon_raw[i].get('moves') or []:
            move_names.add(((m.get('move') or {}).get('name')))
    move_names.discard(None)
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(get_cached, cache, 'move', n): n for n in move_names}
        for fu in as_completed(futs):
            pass
    print('moves: %d (%.1fs)' % (len(move_names), time.time() - t0), flush=True)

    # ---- 타입 이름 ----
    type_keys = set()
    for i in ids:
        for t in pokemon_raw[i].get('types') or []:
            type_keys.add(((t.get('type') or {}).get('name')))
    type_ko = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(get_cached, cache, 'type', n): n for n in type_keys}
        for fu in as_completed(futs):
            n = futs[fu]
            d = fu.result()
            type_ko[n] = pick_ko(d.get('names') or [], 'name') or n
    print('types: %d (%.1fs)' % (len(type_ko), time.time() - t0), flush=True)

    # ---------- 진화 계보 계산 ----------
    def sid(node):
        return int(node['species']['url'].rstrip('/').split('/')[-1])

    evo_by_species = {}     # id -> {chain, stage, len, path, paths, branch}
    all_paths = []          # [[ids...], ...]

    def walk(node, path, chain_id, out_paths):
        me = sid(node)
        p = path + [me]
        kids = node.get('evolves_to') or []
        if not kids:
            out_paths.append(p)
            return
        for k in kids:
            walk(k, p, chain_id, out_paths)

    for cid, ch in chains.items():
        paths = []
        walk(ch['chain'], [], cid, paths)
        for p in paths:
            all_paths.append(p)
            for idx, spid in enumerate(p):
                cur = evo_by_species.get(spid)
                info = {'chain': cid, 'stage': idx, 'len': len(p), 'path': p}
                if not cur:
                    evo_by_species[spid] = {'chain': cid, 'stage': idx, 'len': len(p), 'path': p, 'paths': 1}
                else:
                    cur['stage'] = min(cur['stage'], idx)
                    cur['len'] = max(cur['len'], len(p))
                    cur['paths'] += 1
                    if len(p) > len(cur['path']):
                        cur['path'] = p

    # ---------- 각 포켓몬 정리 ----------
    def best_flavor(sd):
        ko = [e for e in (sd.get('flavor_text_entries') or []) if (e.get('language') or {}).get('name') == 'ko']
        if ko:
            ko.sort(key=lambda e: version_rank((e.get('version') or {}).get('name', '')))
            t = clean(ko[-1].get('flavor_text'))
            if t:
                return (t, 'ko')
        en = [e for e in (sd.get('flavor_text_entries') or []) if (e.get('language') or {}).get('name') == 'en']
        if en:
            en.sort(key=lambda e: version_rank((e.get('version') or {}).get('name', '')))
            return (clean(en[-1].get('flavor_text')), 'en')
        return ('', '')

    def pick_moves(pr):
        groups = {}
        for m in pr.get('moves') or []:
            for d in m.get('version_group_details') or []:
                vg = ((d.get('version_group') or {}).get('name'))
                groups.setdefault(vg, []).append((
                    (m.get('move') or {}).get('name', ''),
                    d.get('level_learned_at') or 0,
                    (d.get('move_learn_method') or {}).get('name')
                ))
        chosen_vg = None
        for vg in VG_ORDER:
            if vg in groups and any(x[2] == 'level-up' for x in groups[vg]):
                chosen_vg = vg
                break
        if chosen_vg is None:
            for vg in VG_ORDER:
                if vg in groups:
                    chosen_vg = vg
                    break
        if chosen_vg is None:
            return []
        lst = groups[chosen_vg]
        level = sorted([x for x in lst if x[2] == 'level-up'], key=lambda x: (x[1], x[0]))
        pool = level if level else sorted(lst, key=lambda x: x[1])
        # 중복 제거
        seen, uniq = set(), []
        for n, lv, meth in pool:
            if n in seen:
                continue
            seen.add(n)
            uniq.append((n, lv))
        if len(uniq) > 4:
            uniq = uniq[:3] + [uniq[-1]]
        return uniq

    CLASS_KO = {'physical': '물리', 'special': '특수', 'status': '변화'}

    def move_ko(name):
        d = get_cached(cache, 'move', name)
        ko = pick_ko(d.get('names') or [], 'name')
        ents = [e for e in (d.get('flavor_text_entries') or []) if (e.get('language') or {}).get('name') == 'ko']
        desc = ''
        if ents:
            ents.sort(key=lambda e: version_rank((e.get('version_group') or {}).get('name', '')))
            desc = clean(ents[-1].get('flavor_text'))
        if not desc:
            ents = [e for e in (d.get('flavor_text_entries') or []) if (e.get('language') or {}).get('name') == 'en']
            if ents:
                ents.sort(key=lambda e: version_rank((e.get('version_group') or {}).get('name', '')))
                desc = clean(ents[-1].get('flavor_text'))
        t = ((d.get('type') or {}).get('name'))
        dc = ((d.get('damage_class') or {}).get('name'))
        return {'ko': ko or name,
                't': type_ko.get(t, t or ''),
                'cls': CLASS_KO.get(dc, ''),
                'pow': d.get('power') or 0,
                'acc': d.get('accuracy') or 0,
                'pp': d.get('pp') or 0,
                'desc': desc}

      # 사람이 다듬은 한국어 도감설명(899~1025) 덮어쓰기
    extra_ko = {}
    extra_path = os.path.join(os.path.dirname(args.out), 'dex-ko-extra.json')
    if os.path.exists(extra_path):
        with open(extra_path, 'r', encoding='utf-8') as f:
            extra_ko = json.load(f)

    species_out = {}
    moves_out = {}
    for i in ids:
        pr, sd = pokemon_raw[i], species_raw[i]
        types = []
        for t in pr.get('types') or []:
            k = ((t.get('type') or {}).get('name'))
            if k and k not in ('unknown', 'shadow'):
                types.append(type_ko.get(k, k))
        stats = {s['stat']['name']: s['base_stat'] for s in pr.get('stats') or []}
        mv = []
        for name, lv in pick_moves(pr):
            mv.append([name, lv])
            if name not in moves_out:
                moves_out[name] = move_ko(name)
        ev = evo_by_species.get(i)
        entry = {
            'id': i,
            'ko': pick_ko(sd.get('names') or [], 'name') or pr.get('name'),
            'en': pr.get('name'),
            'genus': pick_ko(sd.get('genera') or [], 'genus'),
            'types': types,
            'h': (pr.get('height') or 0) / 10.0,
            'w': (pr.get('weight') or 0) / 10.0,
            'dex': best_flavor(sd)[0],
            'dx': best_flavor(sd)[1],
            'st': [stats.get('hp', 0), stats.get('attack', 0), stats.get('defense', 0),
                   stats.get('special-attack', 0), stats.get('special-defense', 0), stats.get('speed', 0)],
            'mv': mv,
            'px': 1 if ((pr.get('sprites') or {}).get('front_default')) else 0,
            'ev': ({'c': ev['chain'], 's': ev['stage'], 'n': ev['len'], 'p': ev['path'], 'b': ev['paths']}
                   if ev else {'c': 0, 's': 0, 'n': 1, 'p': [i], 'b': 1})
        }
        if str(i) in extra_ko and extra_ko[str(i)].strip():
            entry['dex'] = extra_ko[str(i)].strip()
            entry['dx'] = 'ko'
        species_out[str(i)] = entry

    # 경로(라인) 목록: 1·2·3단계
    lines = {}
    for p in all_paths:
        key = 'l' + '-'.join(str(x) for x in p)
        lines[key] = p
    line_list = sorted(lines.values(), key=lambda p: (len(p), p))
    by_len = {1: [], 2: [], 3: [], 'more': []}
    for p in line_list:
        by_len[len(p) if len(p) <= 3 else 'more'].append(p)

    # 계보 기준(체인 최대 깊이) 집계
    chain_paths = {}
    for p in all_paths:
        cid = evo_by_species[p[0]]['chain']
        chain_paths.setdefault(cid, []).append(p)
    chain_stats = {1: {'chains': 0, 'species': 0}, 2: {'chains': 0, 'species': 0}, 3: {'chains': 0, 'species': 0}, 'branch': {'chains': 0}}
    for cid, ps in chain_paths.items():
        depth = max(len(p) for p in ps)
        sp_count = len({s for p in ps for s in p})
        if len(ps) > 1:
            chain_stats['branch']['chains'] += 1
        if depth in (1, 2, 3):
            chain_stats[depth]['chains'] += 1
            chain_stats[depth]['species'] += sp_count

    out = {
        'meta': {
            'source': 'PokeAPI v2',
            'count': len(species_out),
            'generated': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
            'lines': {k: len(v) for k, v in by_len.items()},
            'chains': chain_stats,
        },
        'moves': moves_out,
        'species': species_out,
        'lines': line_list,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('wrote %s (%.1f KB)' % (args.out, os.path.getsize(args.out) / 1024.0))
    print(json.dumps({'species': len(species_out), 'moves': len(moves_out),
                      'lines': out['meta']['lines'], 'chains': chain_stats}, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
