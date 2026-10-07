/* ==========================================================================
   EMC Lab — optional cloud sync client
   File: js/sync.js   (loaded on every page, right after js/common.js)

   The site is fully functional with NO server: progress lives in
   localStorage (EMC.Progress). This module adds an OPT-IN mirror to the
   bundled Express server (server/index.js) for courses that want progress
   to follow a student between machines.

   Rules it follows
   ----------------
   * Disabled by default. Nothing is fetched until the user presses
     "Connect to sync server" on the home dashboard (or a stored flag says so).
   * Never on file:// — sync requires http(s), so opening index.html directly
     stays 100% offline and silent.
   * Every network call is wrapped: a missing server degrades to local-only
     with a toast, never an exception.
   * Writes are debounced (800 ms) so dragging a slider cannot flood the API.
   * The user id is a random anonymous token kept in localStorage — there are
     no accounts, no passwords and no personally identifiable data.
   ========================================================================== */
(function () {
  const FLAG_KEY = 'emc.sync.enabled';
  const UID_KEY = 'emc.sync.uid';

  const httpOnly = /^https?:$/.test(location.protocol);

  /** Anonymous, client-generated identifier (not PII). */
  function uid() {
    let u = EMC.store.get(UID_KEY);
    if (!u) {
      u = 'u-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      EMC.store.set(UID_KEY, u);
    }
    return u;
  }

  const Sync = {
    available: () => httpOnly,
    enabled: () => httpOnly && EMC.store.get(FLAG_KEY) === '1',
    setEnabled(on) { EMC.store.set(FLAG_KEY, on ? '1' : '0'); },

    /** Cheap liveness probe; also reports which storage driver the server uses. */
    async probe() {
      if (!httpOnly) throw new Error('sync requires http(s)');
      const r = await fetch('/api/health', { cache: 'no-store' });
      if (!r.ok) throw new Error('health responded ' + r.status);
      return r.json();
    },

    async pull() {
      const r = await fetch('/api/progress/' + encodeURIComponent(uid()), { cache: 'no-store' });
      if (r.status === 404) return null;              // first visit: nothing stored
      if (!r.ok) throw new Error('pull responded ' + r.status);
      const j = await r.json();
      return j.payload || null;
    },

    async push() {
      const r = await fetch('/api/progress/' + encodeURIComponent(uid()), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(EMC.Progress.read())
      });
      if (!r.ok) throw new Error('push responded ' + r.status);
      return r.json();
    },

    /** Probe, enable, merge remote into local, then push the merged record. */
    async connect() {
      const info = await this.probe();
      this.setEnabled(true);
      const remote = await this.pull();
      if (remote) {
        EMC.Progress.merge(remote);
        document.dispatchEvent(new CustomEvent('emc:progress', { detail: EMC.Progress.read() }));
      }
      await this.push();
      return info;
    },

    disconnect() { this.setEnabled(false); },

    /** Called once on boot: restore remote state and subscribe to changes. */
    init() {
      if (!this.enabled()) return;
      this.pull()
        .then(remote => {
          if (!remote) return;
          EMC.Progress.merge(remote);
          document.dispatchEvent(new CustomEvent('emc:progress', { detail: EMC.Progress.read() }));
        })
        .catch(() => { /* server vanished: stay local, stay quiet */ });

      let timer = 0;
      document.addEventListener('emc:progress', () => {
        if (!this.enabled()) return;
        clearTimeout(timer);
        timer = setTimeout(() => { this.push().catch(() => {}); }, 800);
      });
    }
  };

  EMC.Sync = Sync;
  Sync.init();
})();
