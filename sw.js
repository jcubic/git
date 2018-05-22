/**@license
 *   ___ ___ _____  __      __   _      _____              _           _
 *  / __|_ _|_   _| \ \    / /__| |__  |_   _|__ _ _ _ __ (_)_ _  __ _| |
 * | (_ || |  | |    \ \/\/ / -_) '_ \   | |/ -_) '_| '  \| | ' \/ _` | |
 *  \___|___| |_|     \_/\_/\___|_.__/   |_|\___|_| |_|_|_|_|_||_\__,_|_|
 *
 * this is service worker and it's part of GIT Web terminal
 *
 * Copyright (c) 2018 Jakub Jankiewicz <http://jcubic.pl/me>
 * Released under the MIT license
 *
 */

self.addEventListener('install', function(evt) {
    self.importScripts('https://cdn.jsdelivr.net/npm/browserfs');
    (function loop() {
        if (typeof BrowserFS == 'undefined') {
            console.log('no browserFS');
            setTimeout(loop, 500);
        } else {
            BrowserFS.configure({ fs: 'IndexedDB', options: {} }, function (err) {
                if (err) {
                    console.log(err);
                } else {
                    self.fs = BrowserFS.BFSRequire('fs');
                    self.path = BrowserFS.BFSRequire('path');
                }
            });
        }
    })();
});
var base = self.registration.scope;
var re = new RegExp('^' + base);

self.addEventListener('fetch', function (event) {
    event.respondWith(new Promise(function(resolve, reject) {
        var m = event.request.url.match(/__browserfs__(.*)/);
        if (m && self.fs) {
            var path = m[1];
            console.log(path);
            fs.readFile(path, function(err, buffer) {
                if (err) {
                    reject(err);
                } else {
                    resolve(new Response(buffer));
                }
            });
        } else {
            fetch(event.request).then(resolve).catch(reject);
        }
    }));
});
