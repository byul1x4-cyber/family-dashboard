#!/usr/bin/env python3
"""로컬 미리보기 스텁 — Firebase 를 건드리지 않고 localStorage 만으로 화면을 띄웁니다.

사용: python3 tools/preview.py  (127.0.0.1:8765 에서 work/family-dashboard 를 서빙)
"""
import json, os, sys, threading, functools, http.server, socketserver

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass


def serve(port=8765):
    os.chdir(ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', port), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


TEST_STATE = {
    'version': 1,
    'introSeen': True,
    'mode': 'child',
    'stars': {'minguk': 120, 'ijun': 80},
    'pokemon': {
        'minguk': {'line': 'pichu', 'cur': 0, 'fed': 45, 'dex': [172, 25], 'partner': 25},
        'ijun': {'line': 'l1-2-3', 'cur': 0, 'fed': 100, 'dex': [1, 2, 3], 'partner': 3}
    },
    'pkCfg': {'perLevel': 100}
}


def state_with_dex():
    """상자 페이징(30마리 초과)까지 확인할 수 있게 도감을 넉넉히 채운 테스트 상태"""
    st = json.loads(json.dumps(TEST_STATE))
    st['pokemon']['minguk']['dex'] = [172, 25] + list(range(1, 41))
    st['pokemon']['minguk']['partner'] = 25
    return st


INIT_JS = """
(() => {
  const STATE = %s;
  localStorage.setItem('family-dashboard-gate', JSON.stringify({id: 'fam_test', at: Date.now(), v: 1}));
  localStorage.setItem('family-dashboard-v1', JSON.stringify(STATE));
  /* storage.js 가 window.Storage 를 넣는 순간 init 만 로컬로 바꿔 끼웁니다 (Firebase 접속 금지) */
  let real;
  Object.defineProperty(window, 'Storage', {
    configurable: true,
    get() { return real; },
    set(v) {
      real = v;
      v.init = async function () { return { mode: 'local', state: JSON.parse(localStorage.getItem('family-dashboard-v1')) }; };
      v.save = function (state) { localStorage.setItem('family-dashboard-v1', JSON.stringify(state)); };
      v.hasGate = function () { return true; };
      v.watchLocal = function () {};
    }
  });
})();
"""


def state_js(state):
    return INIT_JS % json.dumps(state, ensure_ascii=False)
