/* global importScripts, self, BrowserFS, git, EventEmitter */
importScripts(
    "https://unpkg.com/isomorphic-git@0.x.x",
    "https://unpkg.com/browserfs@01.x.x",
    "https://rawgit.com/Olical/EventEmitter/master/EventEmitter.js"
);

BrowserFS.configure({
    fs: 'MountableFileSystem',
    options: {
        '/': { fs: 'IndexedDB', options: {}},
        '/tmp': { fs: 'InMemory' }
    }
}, function (err) {
    self.fs = BrowserFS.BFSRequire('fs');
    self.addEventListener('message', ({ data }) => {
        let id = data.id;
        if (data.type !== 'RPC' || id === null) {
            return;
        }
        if (data.method && typeof git[data.method] === 'function') {
            if (data.params.emitter) {
                data.params.emitter = new EventEmitter();
                data.params.emitter.on('message', (message) => {
                    self.postMessage({ type: 'EMITTER', id, method: data.method, message });
                });
            }
            data.params.fs = self.fs;
            git[data.method].apply(git, data.params).then(result => {
                self.postMessage({ type: 'RPC', id, result});
            }).catch((err) => {
                self.postMessage({ type: 'RPC', id, error: ''+err});
            });
        }
    });
});
