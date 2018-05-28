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
    self.skipWaiting();
    self.importScripts('https://cdn.jsdelivr.net/npm/browserfs');
    BrowserFS.configure({ fs: 'IndexedDB', options: {} }, function (err) {
        if (err) {
            console.log(err);
        } else {
            self.fs = BrowserFS.BFSRequire('fs');
            self.path = BrowserFS.BFSRequire('path');
        }
    });
});

self.addEventListener('fetch', function (event) {
    event.respondWith(new Promise(function(resolve, reject) {
        function sendFile(path) {
            fs.readFile(path, function(err, buffer) {
                if (err) {
                    err.fn = 'readFile(' + path + ')';
                    return reject(err);
                }
                resolve(new Response(buffer));
            });
        }
        var url = event.request.url;
        var m = url.match(/__browserfs__(.*)/);
        function redirect_dir() {
            return resolve(Response.redirect(url + '/', 301));
        }
        if (m && self.fs) {
            var path = m[1];
            if (path === '') {
                return redirect_dir();
            }
            console.log('serving ' + path + ' from browserfs');
            fs.stat(path, function(err, stat) {
                if (err) {
                    return resolve(textResponse(error404(path)));
                }
                if (stat.isFile()) {
                    sendFile(path);
                } else if (stat.isDirectory()) {
                    if (path.substr(-1, 1) !== '/') {
                        return redirect_dir();
                    }
                    fs.readdir(path, function(err, list) {
                        if (err) {
                            err.fn = 'readdir(' + path + ')';
                            return reject(err);
                        }
                        var len = list.length;
                        if (list.includes('index.html')) {
                            sendFile(path + '/index.html');
                        } else {
                            var output = [
                                '<!DOCTYPE html>',
                                '<html>',
                                '<body>',
                                '<h1>BrowserFS</h1>',
                                '<ul>'
                            ];
                            if (path.match(/^\/(.*\/)/)) {
                                output.push('<li><a href="..">..</a></li>');
                            }
                            (function loop() {
                                var file = list.shift();
                                if (!file) {
                                    output = output.concat(['</ul>', '</body>', '</html>']);
                                    return resolve(textResponse(output.join('\n')));
                                }
                                fs.stat(path + '/' + file, function(err, stat) {
                                    if (err) {
                                        err.fn = 'stat(' + path + '/' + file + ')';
                                        return reject(err);
                                    }
                                    var name = file + (stat.isDirectory() ? '/' : '');
                                    output.push('<li><a href="' + name + '">' + name + '</a></li>');
                                    loop();
                                });
                            })();
                        }
                    });
                }
            });
        } else {
            if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
                return;
            }
            //request = credentials: 'include'
            fetch(event.request).then(resolve).catch(reject);
        }
    }));
});
function textResponse(string) {
    var blob = new Blob([string], {
        type: 'text/html'
    });
    return new Response(blob);
}

function error404(path) {
    var output = [
        '<!DOCTYPE html>',
        '<html>',
        '<body>',
        '<h1>404 File Not Found</h1>',
        `<p>File ${path} not found in browserfs`,
        '</body>',
        '</html>'
    ];
    return output.join('\n');
}
