/* global importScripts, self, BrowserFS, git, EventEmitter */
window = self;
importScripts(
    "https://unpkg.com/isomorphic-git@0.x.x",
    "https://unpkg.com/browserfs@1.x.x",
    "https://rawgit.com/Olical/EventEmitter/master/EventEmitter.js"
);

self.addEventListener('message', ({ data }) => {
    BrowserFS.configure({
      fs: 'MountableFileSystem',
      options: {
            '/': { fs: 'IndexedDB', options: {}},
            '/tmp': { fs: 'InMemory' }
        }
    }, function (err) {
        self.fs = BrowserFS.BFSRequire('fs');
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
            data.params.fs = self.fs;
            git[data.method].call(git, data.params).then(result => {
                self.postMessage({ type: 'RPC', id, result});
            }).catch((err) => {
                self.postMessage({ type: 'RPC', id, error: ''+err});
            });
        }
    });
});
