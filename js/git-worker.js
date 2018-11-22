/* global importScripts, self, BrowserFS, git, EventEmitter */
window = self;
importScripts(
    "https://unpkg.com/isomorphic-git@0.x.x",
    // '../../../iso-git-latest/dist/bundle.umd.min.js',
    "https://unpkg.com/browserfs@1.x.x",
    "https://rawgit.com/Olical/EventEmitter/master/EventEmitter.js"
);

const localStorage = self.localStorage = wrap('localStorage', [
    'getItem',
    'setItem',
    'removeItem'
]);
function wrap(name, names) {
    const obj = {};
    var id = 0;
    names.forEach(method => {
        obj[method] = (...args) => {
            return new Promise((resolve, reject) => {
                self.addEventListener('message', ({ data }) => {
                    if (data.type === 'RPC' && data.id === id && data.method === method &&
                        data.object === name) {
                        if (data.error) {
                            reject(data.error);
                        } else {
                            resolve(data.result);
                        }
                    }
                });
                self.postMessage({ type: 'RPC', id: ++id, object: name, method, args});
            });
        };
    });
    return obj;
}

const term = wrap('terminal', ['read', 'set_mask', 'confirm', 'resume', 'pause', 'paused']);

const CredentialManager = {
    async fill ({ url }) {
        let paused = await term.paused();
        if (paused) await term.resume();
        let auth = await localStorage.getItem(url);
        if (auth) return JSON.parse(auth);
        const username = await term.read(`Enter username for ${new URL(url).host}: `);
        await term.set_mask(true);
        const password = await term.read('Enter password: ');
        await term.set_mask(false);
        if (paused) await term.pause();
        return {
            username,
            password
        };
    },
    async approved({ url, auth }) {
        let savedAuth = await localStorage.getItem(url);
        if (savedAuth) {
            savedAuth = JSON.parse(savedAuth);
            if (savedAuth.username === auth.username && savedAuth.password === auth.password) {
                // It's already saved.
                return
            }
        }
        let paused = await term.paused();
        if (paused) await term.resume();
        const response = await term.confirm('Do you want to save this password? (Y/N) ');
        console.log('confirm', response)
        if (response) {
            await localStorage.setItem(url, JSON.stringify(auth));
        }
        if (paused) await term.pause();
    },
    async rejected({ url, auth }) {
        if (await localStorage.getItem(url)) {
            let paused = await term.paused();
            if (paused) await term.resume();
            if (await term.confirm(`Authentication to ${new URL(url).host} was unsuccessful. Delete saved password? (Y/N) `)) {
                await localStorage.removeItem(url);
            }
            if (paused) await term.pause();
        }
    }
};

    

self.addEventListener('message', ({ data }) => {
    BrowserFS.configure({
        fs: 'IndexedDB', options: {}
    }, function (err) {
        self.fs = BrowserFS.BFSRequire('fs');
        git.plugins.set('fs', self.fs);
        git.plugins.set('credentialManager', CredentialManager);
        let id = data.id;
        if (data.type !== 'RPC' || id === null) {
            return;
        }
        if (data.method && typeof git[data.method] === 'function') {
            if (data.params.emitter) {
                data.params.emitter = new EventEmitter();
                data.params.emitter.on('message', (message) => {
                    self.postMessage({ type: 'EMITTER', id, message });
                });
            }
            git[data.method].call(git, data.params).then(result => {
                self.postMessage({ type: 'RPC', id, result});
            }).catch((err) => {
                self.postMessage({ type: 'RPC', id, error: ''+err});
            });
        }
    });
});
