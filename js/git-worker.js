/* global importScripts, self, BrowserFS, git, EventEmitter */
window = self;
importScripts(
    //"https://unpkg.com/isomorphic-git@0.x.x",
    '../../../iso-git-latest/dist/bundle.umd.min.js',
    "https://unpkg.com/browserfs@1.x.x",
    "https://rawgit.com/Olical/EventEmitter/master/EventEmitter.js"
);

const localStorage = wrap('localStorage', ['getItem', 'setItem', 'deleteItem']);

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

const term = wrap('terminal', ['read', 'set_mask', 'confirm', 'resume', 'resume', 'pause', 'paused']);

const urlify = (protocol, host, path) => `${protocol}://${host}/${path || ''}`;
    const CredentialManager = {
        async fill ({ protocol, host, path }) {
            this.pased = await term.paused();
            term.resume();
            let url = urlify(protocol, host, path);
            let auth = await localStorage.getItem(url);
            if (auth) return JSON.parse(auth);
            const username = await term.read(`Enter username for ${host}: `);
            await term.set_mask(true);
            const password = await term.read('Enter password: ');
            await term.set_mask(false);
            return {
                username,
                password
            };
        },
        async approved({ protocol, host, path, auth }) {
            let url = urlify(protocol, host, path);
            const response = await term.confirm('Do you want to save this password? (Y/N) ');
            if (response) {
                await localStorage.setItem(url, JSON.stringify(auth));
            }
            if (this.paused) {
                await term.pause();
            }
        },
        async rejected({ protocol, host, path, auth }) {
            let url = urlify(protocol, host, path);
            if (localStorage[url]) {
                if (await term.confirm(`Authentication to ${host} was unsuccessful. Delete saved password? (Y/N) `)) {
                    await localStorage.deleteItem(url);
                }
            }
        }
    };

    

self.addEventListener('message', ({ data }) => {
    BrowserFS.configure({
      fs: 'MountableFileSystem',
      options: {
            '/': { fs: 'IndexedDB', options: {}},
            '/tmp': { fs: 'InMemory' }
        }
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
