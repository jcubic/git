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
        var m = event.request.url.match(/__browserfs__(.*)/);
        if (m && self.fs) {
            var path = m[1];
            if (path === '') {
                path = '/';
            }
            console.log('serving ' + path + ' from browserfs');
            fs.stat(path, function(err, stat) {
                if (err) {
                    return reject(err);
                }
                function sendFile(path) {
                    fs.readFile(path, function(err, buffer) {
                        if (err) {
                            err.fn = 'readFile(' + path + ')';
                            return reject(err);
                        }
                        resolve(new Response(buffer));
                    });
                }
                if (stat.isFile()) {
                    sendFile(path);
                } else if (stat.isDirectory()) {
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
                            var m = path.match(/^\/(.*\/)[^\/]+\/?$/);
                            if (m) {
                                var parent = event.request.url.replace(/[^\/]+\/$/, '');
                                output.push('<li><a href="' + parent + '">..</a></li>');
                            }
                            (function loop() {
                                var file = list.shift();
                                if (!file) {
                                    output = output.concat(['</ul>', '</body>', '</html>']);
                                    var blob = new Blob([output.join('\n')], {
                                        type: 'text/html'
                                    });
                                    return resolve(new Response(blob));
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
            //request = credentials: 'include'
            fetch(event.request).then(resolve).catch(reject);
        }
    }));
});
