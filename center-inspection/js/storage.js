/*
 * 기기 내부 저장소 (storage.js)
 * - IndexedDB 에만 저장하며 외부 서버로 전송하지 않습니다.
 * - IndexedDB 를 쓸 수 없는 브라우저(개인정보 보호 모드 등)는 localStorage 로 대체하고 경고합니다.
 * - 향후 기관 보안 서버를 연동할 때는 같은 인터페이스(list/get/put/remove/clear/getMeta/setMeta)를
 *   구현한 RemoteAdapter 를 만들어 CI.store 에 할당하면 화면 코드를 고치지 않아도 됩니다.
 */
window.CI = window.CI || {};
CI.storage = (function () {
  const DB = 'center-inspection', VER = 1;

  function idbAdapter() {
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res, rej) => {
        const rq = indexedDB.open(DB, VER);
        rq.onupgradeneeded = () => {
          const db = rq.result;
          if (!db.objectStoreNames.contains('inspections')) {
            const s = db.createObjectStore('inspections', { keyPath: 'id' });
            s.createIndex('type', 'type');
          }
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        };
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
      return dbp;
    }
    function tx(store, mode, fn) {
      return open().then(db => new Promise((res, rej) => {
        const t = db.transaction(store, mode), s = t.objectStore(store);
        const out = fn(s);
        t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
        t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      }));
    }
    return {
      kind: 'indexeddb',
      list: () => tx('inspections', 'readonly', s => s.getAll()),
      get: id => tx('inspections', 'readonly', s => s.get(id)),
      put: rec => tx('inspections', 'readwrite', s => s.put(rec)),
      remove: id => tx('inspections', 'readwrite', s => s.delete(id)),
      clear: () => tx('inspections', 'readwrite', s => s.clear()),
      getMeta: k => tx('meta', 'readonly', s => s.get(k)),
      setMeta: (k, v) => tx('meta', 'readwrite', s => s.put(v, k))
    };
  }

  function lsAdapter() {
    const K = 'ci-inspections', M = 'ci-meta';
    const read = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { throw new Error('저장 공간 부족 또는 저장 차단'); } };
    return {
      kind: 'localstorage',
      list: async () => Object.values(read(K)),
      get: async id => read(K)[id],
      put: async rec => { const a = read(K); a[rec.id] = rec; write(K, a); },
      remove: async id => { const a = read(K); delete a[id]; write(K, a); },
      clear: async () => write(K, {}),
      getMeta: async k => read(M)[k],
      setMeta: async (k, v) => { const a = read(M); a[k] = v; write(M, a); }
    };
  }

  function memAdapter() {
    const a = {}, m = {};
    return { kind: 'memory', list: async () => Object.values(a), get: async id => a[id], put: async r => { a[r.id] = r; },
      remove: async id => { delete a[id]; }, clear: async () => { for (const k in a) delete a[k]; },
      getMeta: async k => m[k], setMeta: async (k, v) => { m[k] = v; } };
  }

  async function init() {
    try {
      if (!('indexedDB' in window)) throw 0;
      const ad = idbAdapter();
      await ad.getMeta('probe');
      return ad;
    } catch (e) {
      try { localStorage.setItem('ci-probe', '1'); localStorage.removeItem('ci-probe'); return lsAdapter(); }
      catch (e2) { return memAdapter(); }
    }
  }

  // 브라우저에 저장공간 보존 요청(거부될 수 있음)
  async function persistInfo() {
    const info = { persisted: false, usage: null, quota: null };
    try {
      if (navigator.storage && navigator.storage.persisted) {
        info.persisted = await navigator.storage.persisted();
        if (!info.persisted && navigator.storage.persist) info.persisted = await navigator.storage.persist();
      }
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate(); info.usage = e.usage; info.quota = e.quota;
      }
    } catch (e) { /* 지원하지 않는 브라우저 */ }
    return info;
  }

  return { init, persistInfo };
})();
