/**@license
 *   ___ ___ _____  __      __   _      _____              _           _
 *  / __|_ _|_   _| \ \    / /__| |__  |_   _|__ _ _ _ __ (_)_ _  __ _| |
 * | (_ || |  | |    \ \/\/ / -_) '_ \   | |/ -_) '_| '  \| | ' \/ _` | |
 *  \___|___| |_|     \_/\_/\___|_.__/   |_|\___|_| |_|_|_|_|_||_\__,_|_|
 *
 * Copyright (c) 2018 Jakub Jankiewicz <http://jcubic.pl/me>
 * Released under the MIT license
 *
 */
 
var banner = [
    '  ____ ___ _____ ',
    ' / ___|_ _|_   _| __      __   _      _____              _           _',
    '| |  _ | |  | |   \\ \\    / /__| |__  |_   _|__ _ _ _ __ (_)_ _  __ _| |',
    '| |_| || |  | |    \\ \\/\\/ / -_) \'_ \\   | |/ -_) \'_| \'  \\| | \' \\/ _` | |',
    ' \\____|___| |_|     \\_/\\_/\\___|_.__/   |_|\\___|_| |_|_|_|_|_||_\\__,_|_|'
];
function greetings() {
    var title = this.cols() > banner[1].length ? banner.join('\n') : 'GIT Web Terminal';
    return title + '\n\n' + 'use [[;#fff;]help] to see the available commands' +
           ' or [[;#fff;]credits] to list the projects used\n';
}
function BrowserFSConfigure() {
    return new Promise(function(resolve, reject) {
        BrowserFS.configure({
            fs: 'IndexedDB',
            options: {}
        }, function (err) {
            if (err) {
                var term = $.terminal.active();
                if (!term) {
                    term = $('.term').terminal(function(command, term) {
                        term.error('BrowserFS was not initialized');
                    }, {greetings: false, name: 'git'}).echo(greetings);
                }
                term.error(err.message || err);
                reject(err.message || err);
            } else {
                resolve();
            }
        });
    });
}
 
BrowserFSConfigure().then(() => {
    var name = 'git'; // terminal name for history
    window.fs = BrowserFS.BFSRequire('fs');
    window.path = BrowserFS.BFSRequire('path');
    window.buffer = BrowserFS.BFSRequire('buffer');
    git.plugins.set('fs', window.fs);
    if (typeof zip !== 'undefined') {
        zip.workerScriptsPath = location.pathname.replace(/\/[^\/]+$/, '/') + 'js/zip/';
    }
    var scope = location.pathname.replace(/\/[^\/]+$/, '/');
    if ('serviceWorker' in navigator) {
        // loading this repo from browerFS will not work because serviceWorker can't be loaded from
        // serivice worker.
        if (!scope.match(/__browserfs__/)) {
            navigator.serviceWorker.register('sw.js', {scope})
                     .then(function(reg) {
                         reg.addEventListener('updatefound', function() {
                             var installingWorker = reg.installing;
                             console.log('A new service worker is being installed:',
                                         installingWorker);
                         });
                         // registration worked
                         console.log('Registration succeeded. Scope is ' + reg.scope);
                     }).catch(function(error) {
                         // registration failed
                             console.log('Registration failed with ' + error);
                     });
        }
    }
    var git_wrapper = {};
    if (typeof Worker !== 'undefined') {
        var worker = new Worker(scope + 'js/git-worker.js');
        let count = 0;
        Object.getOwnPropertyNames(git).forEach(function(name) {
            var emitter_handler = null;
            if (typeof git[name] === 'function') {
                git_wrapper[name] = function({emitter, fs, ...args}) {
                    return new Promise(function(resolve, reject) {
                        var id = `rpc${++count}`;
                        if (emitter instanceof EventEmitter) {
                            emitter_handler = function handler({data}) {
                                if (data.type === 'EMITTER' && id === data.id) {
                                    emitter.trigger('message', [data.message]);
                                }
                            };
                            args.emitter = true;
                            worker.addEventListener("message", emitter_handler);
                        }
                        worker.addEventListener("message", function handler({ data }) {
                            if (data.type === 'RPC' && id === data.id) {
                                if (emitter_handler) {
                                    worker.removeEventListener("message", emitter_handler);
                                }
                                // Sync BrowserFS
                                BrowserFSConfigure().then(() => {
                                    window.fs = BrowserFS.BFSRequire('fs');
                                    if (data.error) {
                                        reject(data.error);
                                    } else {
                                        resolve(data.result);
                                    }
                                });
                                worker.removeEventListener("message", handler);
                            }
                        });
                        worker.postMessage({ type: "RPC", method: name, id, params: args});
                    });
                }
            }
        });
    } else {
        Object.getOwnPropertyNames(git).forEach(function(name) {
            git_wrapper[name] = git[name].bind(git);
        });
    }
    var dir = '/';
    var cwd = '/';
    var credentials = {};
    ['username', 'email', 'fullname'].forEach((name) => {
        const value = localStorage.getItem('git_' + name);
        if (value) {
            credentials[name] = value;
        }
    });
    var branch;

    var credentialManager = {
        async fill ({host, protocol, path}) {
            var questions = [];
            if (!credentials.username) {
                questions.push({name: 'username'})
            }
            if (!credentials.password) {
                questions.push({name: 'password', mask: true})
            }
            term.echo('Authenticate to ' + host);
            var history = term.history();
            history.disable();
            var ispaused = term.paused();
            return new Promise((resolve, reject) => {
                (function loop() {
                    var question = questions.shift();
                    if (!question) {
                        history.enable();
                        if (ispaused) term.pause()
                        resolve({
                            username: credentials.username,
                            password: credentials.password
                        })
                    } else {
                        var name = question.name;
                        if (term.paused()) term.resume();
                        term.push(answer => {
                            credentials[name] = answer;
                            if (!question.mask) {
                                localStorage.setItem('git_' + name, answer);
                            }
                            term.pop();
                            loop();
                        }, {
                            prompt: name + ': ',
                            name: 'read'
                        }).set_mask(!!question.mask);
                        if (!question.mask) {
                            term.insert(localStorage.getItem('git_' + name) || '');
                        }
                    }
                })();
            })
        },
        async rejected ({host, protocol, path, auth}) {
            if (auth.username === credentials.username && auth.password === credentials.password) {
                credentials.username = null
                credentials.password = null
            }
        },
        async approved ({host, protocol, path, auth}) {
            // TODO: don't save to localstorage until it works?
        }
    }
    git.plugins.set('credentialManager', credentialManager);

    // -----------------------------------------------------------------------------------------------------
    // :: resolve path
    // -----------------------------------------------------------------------------------------------------
    function resolve(p) {
        return path.resolve(p[0] == '/' ? p : path.join(cwd, p));
    }
    // -----------------------------------------------------------------------------------------------------
    function color(name, string) {
        var colors = {
            blue:   '#55f',
            green:  '#4d4',
            grey:   '#999',
            red:    '#A00',
            yellow: '#FF5',
            violet: '#a320ce',
            white:  '#fff',
            'persian-green': '#0aa'
        };
        if (colors[name]) {
            return '[[;' + colors[name] + ';]' + string + ']';
        } else {
            return string;
        }
    }
    // -----------------------------------------------------------------------------------------------------
    function messageEmitter(re) {
        var emitter = new EventEmitter();
        var first;
        emitter.on('message', (message) => {
            if (re && message.match(re)) {
                if (typeof first === 'undefined') {
                    term.echo(message);
                    first = term.last_index();
                } else {
                    term.update(first, message);
                }
            } else {
                term.echo(message);
            }
        });
        return emitter;
    }
    // -----------------------------------------------------------------------------------------------------
    function list(path) {
        term.pause();
        return listDir(path).then((list) => (term.resume(), list));
    }

    // -----------------------------------------------------------------------------------------------------
    // return path for cd
    function get_path(string) {
        var path = cwd.replace(/^\//, '').split('/');
        if (path[0] === '') {
            path = path.slice(1);
        }
        var parts = string === '/'
        ? string.split('/')
        : string.replace(/\/?[^\/]*$/, '').split('/');
        if (parts[0] === '') {
            parts = parts.slice(1);
        }
        if (string === '/') {
            return [];
        } else if (string.startsWith('/')) {
            return parts;
        } else if (path.length) {
            return path.concat(parts);
        } else {
            return parts;
        }
    }
    // -----------------------------------------------------------------------------------------------------
    function read(cmd, cb, raw) {
        var filename = typeof cmd === 'string' ? cmd : cmd.args.length == 1 ? cwd + '/' + cmd.args[0] : null;
        if (filename) {
            fs.readFile(filename, function(err, data) {
                if (err) {
                    term.error(err.message);
                } else {
                    var text = data.toString('utf8').replace(/\n$/, '');
                    var m = filename.match(/\.([^.]+)$/);
                    if (m) {
                        var language = m[1];
                    }
                    if (!raw && language && Prism.languages[language]) {
                        var grammar = Prism.languages[language];
                        var tokens = Prism.tokenize(text, grammar);
                        text = Prism.Token.stringify(tokens, language);
                    }
                    cb(text);
                }
            });
        }
    }
    // -----------------------------------------------------------------------------------------------------
    function split_args(args) {
        return {
            options: args.filter(arg => arg.match(/^-/)).join('').replace(/-/g, ''),
            args: args.filter(arg => !arg.match(/^-/))
        };
    }
    // -----------------------------------------------------------------------------------------------------
    function processGitFiles(files) {
        return gitroot(cwd).then((dir) => {
            var re = new RegExp('^' + dir + '/');
            return {
                files: files.map(filepath => path.resolve(cwd + '/' + filepath).replace(re, '')),
                dir
            };
        });
    }
    // -----------------------------------------------------------------------------------------------------
    function getOption(option, args) {
        option = args.reduce((acc, arg) => {
            if (typeof acc == 'string') {
                return acc;
            } else if (acc === true) {
                return arg;
            } else if (option instanceof RegExp ? arg.match(option) : arg === option) {
                return true;
            }
            return false;
        }, false);
        return option === true ? false : option;
    }
    // -----------------------------------------------------------------------------------------------------
    function getAllStats({cwd, branch}) {
        function notGitDir(name) {
            return !name.match(/^\.git\/?/);
        }
        return gitroot(cwd).then((dir) => {
            return Promise.all([listBranchFiles({dir, branch}), listDir(dir)]).then(([tracked, rest]) => {
                var re = new RegExp('^' + dir);
                rest = rest.files.map(path => path.replace(re, ''));
                return Promise.all(union(tracked, rest).filter(notGitDir).map(filepath => {
                    return git.status({dir, filepath}).then(status => {
                        return [filepath, status];
                    });
                }));
            });
        });
    }
    // -----------------------------------------------------------------------------------------------------
    function gitAddAll({dir, branch, all}) {
        return getAllStats({cwd: dir, branch}).then((files) => {
            var skip_status = ['unmodified', 'ignored', 'modified', 'deleted', 'added', 'absent'];
            if (!all) {
                skip_status.push('*added');
            }
            return files.filter(([_, status]) => !skip_status.includes(status));
        }).then((files) => {
            return Promise.all(files.map(([filepath, status]) => git.add({dir, filepath})));
        });
    }
    const error = (e) => term.error(e.message || e).resume();
    var commands = {
        mkdir: function(cmd) {
            if (cmd.args.length > 0) {
                var options = [];
                var args = [];
                cmd.args.forEach((arg) => {
                    var m = arg.match(/^-([^\-].*)/);
                    if (m) {
                        options = options.concat(m[1].split(''));
                    } else {
                        args.push(arg);
                    }
                });
                if (args.length) {
                    term.pause();
                    Promise.all(args.map(dir => {
                        dir = dir[0] === '/' ? dir : path.join(cwd, dir);
                        return mkdir(dir, options.includes('p'))
                    })).then(term.resume).catch(error);
                }
            }
        },
        cd: function(cmd) {
            if (cmd.args.length === 1) {
                var dirname = path.resolve(cwd + '/' + cmd.args[0]);
                term.pause();
                fs.stat(dirname, (err, stat) => {
                    if (err) {
                        term.error("Directory doesn't exist").resume();
                    } else if (stat.isFile()) {
                        term.error(`"${dirname}" is not a directory`).resume();
                    } else {
                        cwd = dirname == '/' ? dirname : dirname.replace(/\/$/, '');
                        gitBranch({cwd}).then(b => {
                            branch = b;
                            term.resume();
                        });
                    }
                });
            }
        },
        emacs: function(cmd) {
            term.resume();
            var fname = cmd.args[0];
            if (typeof fname !== 'string') {
                fname = String(fname);
            }
            function init() {
                setTimeout(function() {
                    term.focus(false);
                    $('.Ymacs, .DlLayout').show();
                    ymacs.focus();
                    ymacs.disabled(false);
                    ymacs.callHooks('onResize');
                }, 0);
            }
            if (fname) {
                var path;
                if (fname.match(/^\//)) {
                    path = fname;
                } else {
                    path = (cwd === '/' ? '' : cwd) + '/' + fname;
                }
                init();
                ymacs.getActiveBuffer().cmd('find_file', path);
            } else {
                init();
            }
        },
        vi: function(cmd) {
            var textarea = $('.vi');
            var editor;
            var fname = cmd.args[0];
            if (typeof fname !== 'string') {
                fname = String(fname);
            }
            term.focus(false);
            if (fname) {
                var path;
                if (fname.match(/^\//)) {
                    path = fname;
                } else {
                    path = (cwd === '/' ? '' : cmd) + '/' + fname;
                }
                function open(file) {
                    // we need to replace < and & because jsvi is handling html tags
                    // and don't work properly for raw text
                    textarea.val(file.replace(/</g, '&lt;').replace(/&/g, '&amp;'));
                    editor = window.editor = vi(textarea[0], {
                        color: '#ccc',
                        backgroundColor: '#000',
                        onSave: function() {
                            var file = textarea.val().replace(/&amp;/g, '&').replace(/&lt;/g, '<');
                            fs.writeFile(path, file, function(err, wr) {
                                if (err) {
                                    term.error(err.message);
                                }
                            });
                        },
                        onExit: term.focus
                    });
                }
                fs.stat(path, (err, stat) => {
                    if (stat && stat.isFile()) {
                        read(cmd, open, true);
                    } else {
                        var dir = path.replace(/[^\/]+$/, '');
                        fs.stat(dir, (err, stat) => {
                            if (stat && stat.isDirectory()) {
                                open('')
                            } else if (err) {
                                term.error(err.message);
                            } else {
                                term.error(`${dir} directory don't exists`);
                            }
                        });
                    }
                });
            }
        },
        cat: function(cmd) {
            read(cmd, term.echo);
        },
        less: function(cmd) {
            read(cmd, term.less.bind(term));
        },
        ls: function(cmd) {
            var {options, args} = split_args(cmd.args);
            function filter(list) {
                if (options.match(/a/)) {
                    return list;
                } else if (options.match(/A/)) {
                    return list.filter(name => !name.match(/^\.{1,2}$/));
                } else {
                    return list.filter(name => !name.match(/^\./));
                }
            }
            list(cwd + '/' + (args[0] || '')).then((content) => {
                var dirs = filter(['.', '..'].concat(content.dirs)).map((dir) => color('blue', dir));
                term.echo(dirs.concat(filter(content.files)));
            });
        },
        clean: function() {
            term.push(function(yesno) {
                if (yesno.match(/^y(es)?$/i)) {
                    fs.getRootFS().empty();
                }
                if (yesno.match(/^(y(es)?|n(o)?)$/i)) {
                    term.pop();
                }
            }, {
                prompt: 'are you sure you want clean File System [Y/N]? '
            });
        },
        rm: function(cmd) {
            var {options, args} = split_args(cmd.args);

            var len = args.length;
            if (len) {
                term.pause();
            }
            args.forEach(arg => {
                var path_name = path.resolve(cwd + '/' + arg);
                fs.stat(path_name, async (err, stat) => {
                    if (err) {
                        error(err);
                    } else if (stat) {
                        try {
                            if (stat.isDirectory()) {
                                if (options.match(/r/)) {
                                    await rmdir(path_name);
                                } else {
                                    term.error(`${path_name} is directory`);
                                }
                            } else if (stat.isFile()) {
                                await new Promise((resolve) => fs.unlink(path_name, resolve));
                            } else {
                                term.error(`${path_name} is invalid`);
                            }
                            if (!--len) {
                                term.resume();
                            }
                        } catch(e) {
                            error(e);
                        }
                    }
                });
            });
        },
        zip: function(cmd) {
            term.pause();
            if (cmd.args.length === 2) {
                makeZip.apply(null, cmd.args.map(resolve)).then(() => {
                    term.echo(`click to download [[!;;;;__browserfs__/${cmd.args[1]}]${cmd.args[1]}]`).resume();
                }).catch(error);
            } else {
               term.echo('compress directory\nzip <DIRECTORY> <ZIP FILENAME>');
            }
        },
        view: function(cmd) {
            if (cmd.args.length === 1) {
                view(cmd.args[0]);
            }
        },
        record: function(cmd) {
            if (cmd.args[0] == 'start') {
                term.history_state(true);
            } else if (cmd.args[0] == 'stop') {
                term.history_state(false);
            } else {
                term.echo('usage: record [stop|start]');
            }
        },
        git: {
            reset: async function(cmd) {
                cmd.args.shift();
                term.pause();
                const hard = cmd.args.includes('--hard');
                try {
                    var dir = await gitroot(cwd);
                    const ref = cmd.args.filter(arg => arg.match(/^HEAD/))[0];
                    if (ref) {
                        await gitReset({dir, git: git_wrapper, hard, ref, branch});
                        const commits = await git.log({dir, depth: 1});
                        const commit = commits.pop();
                        const head = await git.resolveRef({dir, ref: 'HEAD'});
                        term.echo(`HEAD is now at ${commit.oid.substring(0, 7)} ${commit.message.trim()}`);
                    }
                } catch(e) {
                    term.exception(e);
                } finally {
                    term.resume();
                }
            },
            branch: function(cmd) {
                term.echo('to be implemented');
            },
            pull: async function(cmd) {
                try {
                    term.pause();
                    var dir = await gitroot(cwd);
                    var remote = 'origin';
                    var HEAD_before = await git.resolveRef({dir, ref: 'HEAD'});
                    var url = await repoURL({dir});
                    var output = [];
                    var ref = await git.resolveRef({
                        dir,
                        ref: 'HEAD',
                        depth: 1
                    });
                    await git_wrapper.pull({
                        dir,
                        singleBranch: true,
                        fastForwardOnly: true,
                        emitter: messageEmitter(/^Compressing/)
                    });
                    // isomorphic git patch
                    const head = await git.resolveRef({
                        dir,
                        ref: 'HEAD',
                        depth: 1
                    });
                    //console.log({head, ref});
                    if (head != ref) {
                        await new Promise((resolve) => fs.writeFile(`${dir}/.git/HEAD`, ref, resolve));
                    }
                    var HEAD_after = await git.resolveRef({dir, ref: 'HEAD'});
                    //console.log(JSON.stringify({HEAD_after, HEAD_before}));
                    if (HEAD_after === HEAD_before) {
                        term.echo('Already up-to-date.');
                    } else {
                        output.push(`From ${url}`);
                        output.push([
                            '   ',
                            HEAD_before.substring(0, 7),
                            '..',
                            HEAD_after.substring(0, 7),
                            '  ',
                            branch,
                            '     -> ',
                            remote,
                            '/',
                            branch
                        ].join(''));
                        output.push('Fast-froward');
                        const diffs = await gitCommitDiff({dir, oldSha: HEAD_before, newSha: HEAD_after});
                        output.push(diffStat(Object.values(diffs).map(val => val.diff)));
                        term.echo(output.join('\n'));
                    }
                } catch (e) {
                    term.exception(e);
                } finally {
                    term.resume();
                }
                /* TODO:
                 *
                 * remote: Counting objects: 3, done.
                 * remote: Compressing objects: 100% (2/2), done.
                 * remote: Total 3 (delta 0), reused 3 (delta 0), pack-reused 0
                 * Unpacking objects: 100% (3/3), done.
                 * From github.com:jcubic/test
                 *    b132560..fd4588d  master     -> origin/master
                 * Updating b132560..fd4588d
                 * Fast-forward
                 *  bar | 1 +
                 *  1 file changed, 1 insertion(+)
                 */
            },
            fetch: async function(cmd) {
                cmd.args.shift();
                try {
                    if (cmd.args.length) {
                        term.pause();
                        var dir = await gitroot(cwd);
                        var emitter = messageEmitter(/^Compressing/);
                        await git_wrapper.fetch({
                            dir,
                            singleBranch: true,
                            ref: cmd.args[0],
                            //depth: 1,
                            emitter
                        });
                    }
                } catch(e) {
                    term.error(e.message || e);
                } finally {
                    term.resume();
                }
            },
            checkout: async function(cmd) {
                cmd.args.shift();
                try {
                    if (cmd.args.length) {
                        term.pause();
                        var dir = await gitroot(cwd);
                        await git_wrapper.checkout({dir, ref: cmd.args[0]});
                        branch = await gitBranch({cwd});
                    } else {
                        term.echo('to be implemented');
                        /*
                         * M       js/main.js
                         * Your branch is up-to-date with 'origin/gh-pages'.
                         */
                    }
                } catch (e) {
                    term.error(e.message || e);
                } finally {
                    term.resume();
                }
                /* TODO:
                 *
                 * Switched to branch 'gh-pages'
                 * Your branch is up-to-date with 'origin/gh-pages'.
                 *
                 * Switched to a new branch 'test'
                 *
                 * Switched to branch 'master'
                 * Your branch is ahead of 'origin/master' by 2 commits.
                 *   (use "git push" to publish your local commits)
                 */
            },
            push: async function(cmd) {
                term.pause();
                var emitter = new EventEmitter();
                emitter.on('message', (message) => {
                    term.echo(message);
                });
                try {
                    var dir = await gitroot(cwd);
                    var url = await repoURL({dir});
                    var branches = await git.listBranches({dir, remote: 'origin'});
                    var output = [`To ${url}`];
                    if (branches.includes(branch)) {
                        var ref = await git.resolveRef({dir, ref: `refs/remotes/origin/${branch}`});
                        var HEAD = await git.resolveRef({dir, ref: 'HEAD'});
                        output.push(`   ${ref.substring(0, 7)}..${HEAD.substring(0, 7)} ${branch} -> ${branch}`);
                    } else {
                        output.push(` * [new branch]      ${branch} -> ${branch}`);
                    }
                    await git.push({
                        dir,
                        ref: branch,
                        emitter
                    });
                    term.echo(output.join('\n'));
                } catch (e) {
                    term.error(e.message || e);
                } finally {
                    term.resume();
                }
            },
            commit: async function(cmd) {
                cmd.args.shift();
                term.pause();
                try {
                    async function commit() {
                        var head = await git.resolveRef({dir, ref: 'HEAD'});
                        var commit = await git.commit({
                            dir,
                            author: {
                                email: credentials.email,
                                name
                            },
                            message
                        });
                        function mod(field, label) {
                            return Object.keys(diffs).filter(fielpath => diffs[fielpath][field]).map(fielpath => {
                                return ` ${label} mode 100644 ${fielpath}`;
                            }).join('\n');
                        }
                        var diffs = await gitCommitDiff({dir, newSha: commit, oldSha: head});
                        var stat = diffStat(Object.values(diffs).map(value => value.diff));
                        term.echo(`[master ${commit.substring(0, 7)}] ${message}\n${stat}`);
                        term.echo(mod('deleted', 'delete'));
                        term.echo(mod('added', 'create'));
                    }
                    var dir = await gitroot(cwd);
                    var all = !!cmd.args.filter(arg => arg.match(/^-.*a/)).length;
                    if (all) {
                        await gitAddAll({dir, branch});
                    }
                    var message = getOption(/-.*m$/, cmd.args);
                    var name = credentials.fullname || credentials.username;
                    if (!name) {
                        term.error('You need to use git login first');
                    } else if (!message) {
                        var textarea = $('.vi');
                        var file = [
                            '',
                            '# Please enter the commit message for your changes. Lines starting',
                            '# with \'#\' will be ignored, and an empty message aborts the commit.',
                            '#'
                        ];
                        var head = await getHEAD({dir});
                        var remote = await getHEAD({dir, remote: true});
                        if (head === remote) {
                            file = file.concat([
                                `# On branch ${branch}`,
                                `# Your branch is up-to-date with 'origin/${branch}'.`,
                                '#'
                            ]);
                        }
                        var files = await getAllStats({cwd, branch});
                        var staged = files.filter(([_, stat]) => ['modified', 'deleted', 'added'].includes(stat));
                        var not_staged = files.filter(([_, stat]) => ['*modified', '*deleted'].includes(stat));
                        var new_files = files.filter(([_, stat]) => stat === '*added');
                        console.log({files, staged, not_staged, new_files});
                        var mapping = {
                            'added': 'new file'
                        }
                        const format = ([filepath, status]) => {
                            status = status.replace(/^\*/, '');
                            return '#   ' + padright(`${mapping[status] || status}:`, 12) + filepath;
                        };
                        const append = (array, message) => file = file.concat([message], array.map(format), ['#']);
                        if (staged.length) {
                            append(staged, '# Changes to be committed:');
                        }
                        if (not_staged.length) {
                            append(not_staged, '# Changes not staged for commit:');
                        }
                        if (new_files.length) {
                            file = file.concat([
                                '# Untracked files:'
                            ], new_files.map(([file]) => `#   ${file}`), ['#']);
                        }
                        textarea.val(file.join('\n').replace(/</g, '&lt;').replace(/&/g, '&amp;'));
                        term.focus(false);
                        var editor = window.editor = vi(textarea[0], {
                            color: '#ccc',
                            backgroundColor: '#000',
                            onSave: function() {
                                file = textarea.val().replace(/&amp;/g, '&').replace(/&lt;/g, '<').split('\n');
                            },
                            onExit: async function() {
                                message = file.filter(line => !line.startsWith('#')).join('\n').trim();
                                if (!message) {
                                    term.echo('Aborting commit due to empty commit message.');
                                } else {
                                    await commit();
                                }
                                term.focus();
                            }
                        });
                    } else {
                        await commit();
                    }
                } catch(e) {
                    term.exception(e);
                    throw e;
                } finally {
                    term.resume();
                }
            },
            add: function(cmd) {
                term.pause();
                cmd.args.shift();
                var all_git = cmd.args.filter(arg => arg.match(/^(-A|-all)$/)).length;
                var all = !!cmd.args.filter(arg => arg === '.').length;
                if (all || all_git) {
                    gitroot(cwd).then(dir => {
                        return gitAddAll({dir, branch, all});
                    }).then(term.resume).catch(error);
                } else if (cmd.args.length > 0) {
                    processGitFiles(cmd.args).then(({files, dir}) => {
                        return Promise.all(files.map(filepath => git.add({dir, filepath})));
                    }).then(term.resume).catch(error);
                } else {
                    term.resume();
                }
            },
            rm: function(cmd) {
                cmd.args.shift();
                var long_options = cmd.args.filter(name => name.match(/^--/));
                var {args, options} = split_args(cmd.args.filter(name => !name.match(/^--/)));
                var len = args.length;
                if (!len) {
                    term.error('Nothing to remove');
                } else {
                    term.pause();
                    gitroot(cwd).then((dir) => {
                        var re = new RegExp('^' + dir + '/');
                        args.forEach(arg => {
                            var path_name = path.resolve(cwd + '/' + arg);
                            fs.stat(path_name, (err, stat) => {
                                if (err) {
                                    term.error(err);
                                } else if (stat) {
                                    var filepath = path_name.replace(re, '');
                                    if (stat.isDirectory()) {
                                        var promise = git.listDir({dir}).then((list) => {
                                            var files = list.filter(name => name.startsWith(filepath));
                                            return Promise.all(files.map(file => git.remove({dir, filepath})));
                                        }).catch(err => term.error(err));
                                        if (options.match(/r/)) {
                                            if (!long_options.includes(/--cached/)) {
                                                promise.then(() => rmdir(path_name));
                                            }
                                        } else {
                                            term.error(`${path_name} is directory`);
                                        }
                                    } else if (stat.isFile()) {
                                        if (!long_options.includes(/--cached/)) {
                                            git.remove({dir, filepath}).then(() => fs.unlink(path_name));
                                        } else {
                                            git.remove({dir, filepath})
                                        }
                                    }
                                } else {
                                    term.error('uknown error');
                                }
                                if (!--len) {
                                    term.resume();
                                }
                            });
                        });
                    });
                }
            },
            login: function() {
                var questions = [
                    {name: 'username'},
                    {name: 'password', mask: true},
                    {name: 'fullname'},
                    {name: 'email'}
                ]
                term.echo('This will not authenticate to test if login/password are correct,\n'+
                          'only save credentials in localStorage (expect password) and use them when push/clone/commit');
                var history = term.history();
                history.disable();
                (function loop() {
                    var question = questions.shift();
                    if (!question) {
                        history.enable();
                    } else {
                        var name = question.name;
                        term.push(answer => {
                            credentials[name] = answer;
                            if (!question.mask) {
                                localStorage.setItem('git_' + name, answer);
                            }
                            term.pop();
                            loop();
                        }, {
                            prompt: name + ': ',
                            name: 'read'
                        }).set_mask(!!question.mask);
                        if (!question.mask) {
                            term.insert(localStorage.getItem('git_' + name) || '');
                        }
                    }
                })();
            },
            status: function(cmd) {
                var dir = cwd.split('/')[1];
                term.pause();
                /* TODO:
                 * On branch master
                 * Your branch is ahead of 'origin/master' by 1 commit.
                 *   (use "git push" to publish your local commits)
                 *
                 * nothing to commit, working tree clean
                 */
                getAllStats({cwd, branch}).then((files) => {
                    function filter(files, name) {
                        if (name instanceof Array) {
                            return files.filter(([_, status]) => name.includes(status));
                        }
                        return files.filter(([_, status]) => status === name);
                    }
                    function not(files, name) {
                        if (name instanceof Array) {
                            return files.filter(([_, status]) => !name.includes(status));
                        }
                        return files.filter(([_, status]) => status !== name);
                    }
                    var changes = not(files, ['unmodified', 'ignored']);
                    if (!changes.length) {
                        git.log({dir, depth: 2, ref: branch}).then((commits) => {
                            term.echo(`On branch ${branch}`);
                            if (commits.length == 2) {
                                term.echo('nothing to commit, working directory clean\n');
                            } else {
                                // new repo
                                term.echo('nothing to commit (create/copy files and use "git add" to track)\n');
                            }
                            term.resume();
                        });
                    } else {
                        var label = {
                            'deleted':  'deleted:    ',
                            'added':    'new file:   ',
                            'modified': 'modified:   ',
                            'absent':   'deleted:    '
                        };
                        var padding = '        ';
                        var output = [`On branch ${branch}`];
                        function listFiles(files, colorname) {
                            return files.map(([name, status]) => {
                                return padding + color(colorname, label[status.replace(/^\*/, '')] + name);
                            });
                        }
                        var lines;
                        var to_be_added = filter(changes, ['added', 'modified', 'deleted']);
                        if (to_be_added.length) {
                            lines = [
                                'Changes to be committed:',
                                '  (use "git rm --cached <file>..." to unstage)',
                                ''
                            ];
                            lines = lines.concat(listFiles(to_be_added, 'green'));
                            output.push(lines.join('\n'));
                        }
                        var not_added = filter(changes, ['*modified', '*deleted', '*absent']);
                        if (not_added.length) {
                            lines = [
                                'Changes not staged for commit:',
                                '  (use "git add <file>..." to update what will be committed)',
                                '  (use "git checkout -- <file>..." to discard changes in the working directory)',
                                ''
                            ];
                            lines = lines.concat(listFiles(not_added, 'red'));
                            output.push(lines.join('\n'));
                        }
                        var untracked = filter(changes, '*added');
                        if (untracked.length) {
                            lines = [
                                'Untracked files:',
                                '  (use "git add <file>..." to include in what will be committed)',
                                ''
                            ];
                            lines = lines.concat(untracked.map(([name, status]) => padding + color('red', name)));
                            output.push(lines.join('\n'));
                        }
                        if (output.length) {
                            term.echo(output.join('\n\n') + '\n');
                        }
                        term.resume();
                    }
                }).catch(error);
            },
            diff: function(cmd) {
                cmd.args.shift();
                term.pause();
                function diff({dir, filepath}) {
                    return gitDiff({dir, filepath, branch}).then(diff => {
                        const text = diff.hunks.map(hunk => {
                            let output = [];
                            output.push(color(
                                'persian-green',
                                [
                                    '@@ -',
                                    hunk.oldStart,
                                    ',',
                                    hunk.oldLines,
                                    ' +',
                                    hunk.newStart,
                                    ',',
                                    hunk.newLines,
                                    ' @@'
                                ].join('')
                            ));
                            output = output.concat(hunk.lines.map(line => {
                                let color_name;
                                if (line[0].match(/[+-]/)) {
                                    color_name = line[0] == '-' ? 'red' : 'green';
                                }
                                if (color_name) {
                                    return color(color_name, line);
                                } else {
                                    return line;
                                }
                            }));
                            return output.join('\n');
                        }).join('\n');
                        return {
                            text,
                            filepath
                        };
                    });
                }
                function format(diff) {
                    const header = ['diff --git a/' + diff.filepath + ' b/' + diff.filepath];
                    header.push('--- ' + diff.filepath);
                    header.push('+++ ' + diff.filepath);
                    return [color('white', header.join('\n')), diff.text].join('\n');
                }
                gitroot(cwd).then(dir => {
                    if (!cmd.args.length) {
                        return git.listFiles({dir}).then(files => {
                            return Promise.all(files.map((filepath) => {
                                try {
                                    return git.status({dir, filepath}).then(status => {
                                        if (['unmodified', 'ignored'].includes(status)) {
                                            return null;
                                        } else {
                                            return diff({dir, filepath});
                                        }
                                    });
                                } catch(e) {
                                    debugger;
                                    throw e;
                                }
                            }));
                        }).then((diffs) => {
                            return diffs.filter(Boolean).reduce((acc, diff) => {
                                acc.push(format(diff));
                                return acc;
                            }, []).join('\n');
                        });
                    } else {
                        var re = new RegExp('^' + dir + '/?');
                        var filepath = fname.replace(re, '');
                        return diff({dir, filepath}).then(({diff}) => diff).then(format);
                    }
                }).then(text => {
                    if (text.length - 1 > term.rows()) {
                        term.less(text);
                    } else {
                        term.echo(text);
                    }
                    term.resume();
                }).catch(err => term.error(err.message).resume());
            },
            log: function(cmd) {
                term.pause();
                var depth = getOption('-n', cmd.args);
                depth = depth ? +depth : undefined;
                gitroot(cwd).then(dir => {
                    return Promise.all([getHEAD({dir}), getHEAD({dir, remote: true})])
                                  .then(([head, remote_head]) => ({ dir, head, remote_head }));
                }).then(({dir, head, remote_head}) => {
                    function format(commit) {
                        console.log({head, remote_head, commit: commit.oid});
                        var output = [];
                        var suffix = '';
                        if (head === remote_head && head === commit.oid) {
                            suffix = [
                                ' (' + color('persian-green', 'HEAD -> '),
                                color('green', branch) + ',',
                                color('red', 'origin/' + branch) + ')'
                            ].join(' ');
                        } else if (remote_head === commit.oid) {
                            suffix = [
                                ' (' + color('red', `origin/${branch}`) + ',',
                                color('red', 'origin/HEAD') + ')'
                            ].join(' ');
                        } else if (head === commit.oid) {
                            suffix = [
                                ' (' + color('persian-green', 'HEAD -> '),
                                color('green', branch) + ')'
                            ].join(' ');
                        }
                        output.push(color('yellow', `commit ${commit.oid}` + suffix));
                        var committer = commit.committer;
                        if (committer) {
                            output.push(`Author: ${committer.name} <${committer.email}>`);
                            output.push(`Date: ${date(committer.timestamp, committer.timezoneOffset)}`);
                        }
                        output.push('');
                        output.push(`    ${commit.message}`);
                        return output.join('\n');
                    }
                    return git.log({dir, depth, ref: branch}).then(commits => {
                        var text = commits.filter(commit => !commit.error).map(format).join('\n\n');
                        if (text.length - 1 > term.rows()) {
                            term.less(text);
                        } else {
                            term.echo(text);
                        }
                        term.resume();
                    });
                }).catch(error);
            },
            clone: function(cmd) {
                term.pause();
                cmd.args.shift();
                var args = [];
                var options = {};
                var long;
                var re = /^--(.*)/;
                cmd.args.forEach(function(arg) {
                    if (long) {
                        options[long[1]] = arg;
                    } else if (!String(arg).match(re)) {
                        args.push(arg);
                    }
                    long = String(arg).match(re);
                });
                var depth = getOption(/^--depth/, cmd.args);
                var url = args[0];
                re = /\/([^\/]+?)(\.git)?$/;
                var repo_dir = path.join(cwd, (args.length === 2 ? args[1] : args[0].match(re)[1]));
                fs.stat(repo_dir, function(err, stat) {
                    if (err) {
                        mkdir(repo_dir, true).then(clone).catch(error);
                    } else if (stat) {
                        if (stat.isFile()) {
                            term.error(`"${repo_dir}" is a file`).resume();
                        } else {
                            fs.readdir(repo_dir, function(err, list) {
                                if (list.length) {
                                    term.error(`"${repo_dir}" exists and is not empty`).resume();
                                } else {
                                    clone();
                                }
                            });
                        }
                    }
                });
                var emitter = new EventEmitter();
                var index = null;
                emitter.on('message', (message) => {
                    if (message.match(/Compressing/)) {
                        if (index === null) {
                            term.echo(message);
                            index = term.last_index();
                        } else {
                            term.update(index, message);
                        }
                    } else {
                        term.echo(message);
                    }
                });
                function clone() {
                    term.echo(`Cloning into '${repo_dir}'...`);
                    var auth = {};
                    if (credentials.username && credentials.password) {
                        auth = {
                            authUsername: credentials.username,
                            authPassword: credentials.password
                        };
                    }
                    git.clone({
                        dir: repo_dir,
                        url: url,
                        corsProxy: 'https://jcubic.pl/proxy.php?',
                        ...auth,
                        depth: depth ? +depth : undefined,
                        singleBranch: true,
                        emitter: emitter
                    }).then(term.resume).catch(error);
                }
            }
        },
        credits: function() {
            var lines = [
                '',
                'Projects used with GIT Web Terminal:',
                '\t[[!;;;;https://isomorphic-git.github.io]isomorphic-git] v. ' + git.version() + ' by William Hilton',
                '\t[[!;;;;https://github.com/jvilk/BrowserFS]BrowserFS] by John Vilk',
                '\t[[!;;;;https://terminal.jcubic.pl]jQuery Terminal] v.' + $.terminal.version + ' by Jakub Jankiewicz',
                '\t[[!;;;;https://github.com/timoxley/wcwidth]wcwidth] by Tim Oxley',
                '\t[[!;;;;https://github.com/inexorabletash/polyfill]keyboard key polyfill] by Joshua Bell',
                '\t[[!;;;;https://github.com/jcubic/jsvi]jsvi] originaly by Internet Connection, Inc. with changes from Jakub Jankiewicz',
                '\t[[!;;;;https://github.com/Olical/EventEmitter/]EventEmitter] by Oliver Caldwell',
                '\t[[!;;;;https://github.com/PrismJS/prism]PrismJS] by Lea Verou',
                '\t[[!;;;;https://github.com/kpdecker/jsdiff]jsdiff] by Kevin Decker',
                '\t[[!;;;;https://github.com/softius/php-cross-domain-proxy]AJAX Cross Domain (PHP) Proxy] by Iacovos Constantinou',
                '\t[[!;;;;https://github.com/jcubic/Clarity]Clarity icons] by Jakub Jankiewicz',
                '\t[[!;;;;https://github.com/jcubic/jquery.splitter]jQuery Splitter] by Jakub Jankiewicz',
                '\t[[!;;;;http://www.ymacs.org/]Ymacs] by Mihai Bazon & Dynarch.com',
                '\t[[!;;;;http://stuk.github.io/jszip/]JSZip] by Stuart Knightley',
                '',
                'Contributors:'
            ].concat(contributors.map(user => '\t[[!;;;;' + user.url + ']' + (user.fullname || user.name) + ']'));
            term.echo(lines.join('\n') + '\n');
        },
        help: function() {
            term.echo('\nList of commands: ' + Object.keys(commands).join(', '), {keepWords: true});
            term.echo('List of Git commands: ' + Object.keys(commands.git).join(', '), {keepWords: true});
            term.echo([
                '',
                'to use git you first need to clone the repo (by default it creates shallow clone with --depth 2),',
                'then you can made changes using [[;#fff;]vi] or [[;#fff;]emacs], use [[;#fff;]git add] and then ' +
                '[[;#fff;]git commit].',
                '',
                'Before you commit you need to use the command [[b;#fff;]git login] which will ask for credentials.',
                'It will also ask for full name and email to be used in [[b;#fff;]git commit]. If you set the correct',
                'username and password you can push to remote; if you\'ll type wrong credentials you can call login again.',
                '',
                'To view the files you can use [[;#fff;]view <file>] commands that will split terminal and open browser.',
                'You can also open directories (it\'s just iframe with files served from browserfs using service worker).',
                'If you have web app you can open it using file browser and [[;#fff;]view] command.',
                '',
                'You can use [[;#fff;]record start] to record commands in url hash so you can share commansds you\'ll type.',
                ''
            ].join('\n'), {keepWords: true});
        }
    };
    var ymacs = init_ymacs();
    var scrollTop;
    var view = (function() {
        var base = location.pathname.replace(/\/[^\/]+$/, '/').replace(/__browserfs__.*/, '');
        var viewer = $('.viewer');
        var iframe = viewer.find('iframe');
        var splitter;
        viewer.on('click', '.close', function() {
            if (splitter) {
                splitter.destroy();
                splitter = null;
                viewer.hide();
                $('.terminal-view').css('width', '');
            }
        });
        var adress = viewer.find('input').on('keydown', function(e) {
            if (e.key.toLowerCase() == 'enter') {
                view(adress.val());
            }
        });
        viewer.on('click', '.refresh', function() {
            view(adress.val());
        });
        var paths = [];
        var index = 0;
        var next = viewer.find('.next').on('click', function() {
            if (!next.is('.disabled')) {
                view(paths[++index], true);
            }
        });
        var prev = viewer.find('.prev').on('click', function() {
            if (!prev.is('.disabled')) {
                view(paths[--index], true);
            }
        });

        function view(path, soft) {
            if (!splitter) {
                splitter = $('.split').split({
                    orientation: 'vertical',
                    limit: 400
                });
            }
            iframe.off('load').on('load', function() {
                var path = iframe[0].contentWindow.location.href.replace(/.*__browserfs__/, '');
                adress.val(path);
                // this need to be added each time because we need to access soft prop
                if (!soft) {
                    paths = paths.slice(0, index + 1);
                    paths.push(path);
                    index = paths.length - 1;
                }
                soft = false;
                next.toggleClass('disabled', index === paths.length - 1);
                prev.toggleClass('disabled', index === 0);
            }).attr('src', base + '__browserfs__' + resolve(path));
        }

        return view;
    })();
    var term = $('.term').terminal(function(command, term) {
        var cmd = $.terminal.split_command(command);
        if (commands[cmd.name]) {
            var action = commands[cmd.name];
            var args = cmd.args.slice();
            while (true) {
                if (typeof action == 'object' && args.length) {
                    action = action[args.shift()];
                } else {
                    break;
                }
            }
            if (action) {
                action.call(term, cmd);
            } else {
                term.error('Unknown command');
            }
        } else if (command) {
            term.error('Unknown command');
        }
    }, {
        execHash: true,
        onResize: function() {
            this.innerHeight(this.parent().height());
        },
        completion: function(string, cb) {
            var cmd = $.terminal.parse_command(this.before_cursor());
            function processAssets(callback) {
                var dir = get_path(string);
                list('/' + dir.join('/')).then(callback);
            }
            function prepend(list) {
                if (string.match(/\//)) {
                    var path = string.replace(/\/[^\/]+$/, '').replace(/\/+$/, '');
                    return list.map((dir) => path + '/' + dir);
                } else {
                    return list;
                }
            }
            function trailing(list) {
                return list.map((dir) => dir + '/');
            }
            if (cmd.name !== string) {
                switch (cmd.name) {
                    // complete file and directories
                    case 'rm':
                    case 'cat':
                    case 'vi':
                    case 'less':
                    case 'emacs':
                        return processAssets(content => cb(prepend(trailing(content.dirs).concat(content.files))));
                    // complete directories
                    case 'ls':
                    case 'cd':
                        return processAssets(content => cb(prepend(trailing(content.dirs))));
                }
            }
            if (cmd.args.length) {
                var command = commands[cmd.name];
                if (command) {
                    var args = cmd.args.slice();
                    while (true) {
                        if (typeof command == 'object' && args.length > 1) {
                            command = command[args.shift()];
                        } else {
                            break;
                        }
                    }
                    if ($.isPlainObject(command)) {
                        cb(Object.keys(command));
                    }
                }
            } else {
                cb(Object.keys(commands));
            }
        },
        greetings: false,
        name,
        prompt: function(cb) {
            var path = color('blue', cwd);
            var b = branch ? ' &#91;' + color('violet', branch) + '&#93;' : '';
            cb([
                color('green', (credentials.username || 'anonymous') + '@gitwebterm'),
                ':',
                path,
                b,
                '$ '
            ].join(''));
        }
    }).echo(greetings);
});

// ---------------------------------------------------------------------------------------------------------
function init_ymacs() {
    var ymacs = new Ymacs({
        buffers: [ ],
        className: "Ymacs-blinking-caret"
    });
    ymacs.setColorTheme([ "dark", "y" ]);
    ymacs.disabled(true);
    var wrapper = $('.terminal-view').resizer(function() {
        ymacs.callHooks('onResize');
    });
    $(ymacs.getElement()).appendTo(wrapper);
    try {
        ymacs.getActiveBuffer().cmd("eval_file", ".ymacs");
    } catch(ex) {}
    // -------------------------------------------------------------------------------------------------
    Ymacs.prototype.fs_setFileContents = function(name, content, stamp, cont) {
        var self = this;
        if (stamp) {
            fs.readFile(name, function(err, file) {
                if (file != stamp) {
                    cont(null);
                } else {
                    self.fs_setFileContents(name, content, false, cont);
                }
            });
        } else {
            fs.writeFile(name, content, function(err, written) {
                if (!err) {
                    cont(content);
                } else {
                    self.getActiveBuffer().signalInfo("Can't save file");
                }
            });
        }
    };
    // -------------------------------------------------------------------------------------------------
    Ymacs.prototype.fs_getFileContents = function(name, nothrow, cont) {
        var self = this;
        console.log(name);
        fs.stat(name, function(err, stat) {
            if (err || !stat.isFile()) {
                cont(null, null);
            } else {
                fs.readFile(name, function(err, file) {
                    if (err) {
                        if (!nothrow) {
                            throw new Ymacs_Exception("File not found");
                        } else {
                            self.getActiveBuffer().signalInfo("Can't open file");
                        }
                    } else {
                        cont(file.toString(), file.toString());
                    }
                });
            }
        });
    };
    // -------------------------------------------------------------------------------------------------
    Ymacs.prototype.fs_fileType = function(name, cont) {
        fs.stat(name, function(err, stat) {
            cont(err || stat.isFile() ? true : null);
        });
    };
    // -------------------------------------------------------------------------------------------------
    Ymacs.prototype.fs_normalizePath = function(path) {
        return path;
    };
    // -------------------------------------------------------------------------------------------------
    Ymacs.prototype.fs_getDirectory = function(dir, cont) {
        fs.readdir(dir, function(err, list) {
            var result = {};
            (function loop() {
                var obj = list.shift();
                if (!obj) {
                    cont(result);
                } else {
                    fs.stat(dir + '/' + obj, function(err, stat) {
                        if (!err) {
                            result[obj] = {type: stat.isFile() ? 'file' : 'directory'}
                            loop();
                        }
                    });
                }
            })();
        });
    };
    // -------------------------------------------------------------------------------------------------
    Ymacs_Buffer.newCommands({
        exit: Ymacs_Interactive(function() {
            var buffs = ymacs.buffers.slice();
            (function loop() {
                var buff = buffs.shift();
                if (buff.length > 1) {
                    function next() {
                        ymacs.killBuffer(buff);
                        loop();
                    }
                    if (buff.name != '*scratch*') {
                        if (buff.dirty()) {
                            var msg = 'Save file ' + buff.name + ' yes or no?';
                            buff.cmd('minibuffer_yn', msg, function(yes) {
                                if (yes) {
                                    buff.cmd('save_buffer_with_continuation',
                                             false,
                                             next);
                                } else {
                                    next();
                                }
                            });
                        } else {
                            next();
                        }
                    }
                } else {
                    $('.DlDesktop, .DlLayout, .Ymacs').hide();
                    ymacs.disabled(true);
                    $.terminal.active().focus();
                }
            })();
        }),
        next_buffer: Ymacs_Interactive(function() {
            var buffs = ymacs.buffers.slice();
            var buff = ymacs.getActiveBuffer();
            while(buffs.shift() != buff) {}
            if (buffs.length) {
                ymacs.switchToBuffer(buffs[0]);
            } else {
                ymacs.switchToBuffer(ymacs.buffers[0]);
            }
        })
    });
    // -------------------------------------------------------------------------------------------------
    DEFINE_SINGLETON("Ymacs_Keymap_Leash", Ymacs_Keymap_Emacs, function(D, P) {
        D.KEYS = {
            "C-x C-c": "exit"
        };
    });
    return ymacs;
}

// ---------------------------------------------------------------------------------------------------------
function time() {
    var d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => ('0' + n).slice(-2)).join(':');
}

// ---------------------------------------------------------------------------------------------------------
function listDir(path) {
    return new Promise(function(resolve, reject) {
        fs.readdir(path, function(err, dirList) {
            if (err) {
                return reject(err);
            }
            var result = {
                files: [],
                dirs: []
            };
            var len = dirList.length;
            if (!len) {
                resolve(result);
            }
            dirList.forEach(function(filename) {
                var file = (path === '/' ? '' : path) + '/' + filename;

                fs.stat(file, function(err, stat) {
                    if (stat) {
                        result[stat.isFile() ? 'files' : 'dirs'].push(filename);
                    }
                    if (!--len) {
                        resolve(result);
                    }
                });
            });

        });
    });
}

// ---------------------------------------------------------------------------------------------------------
// source: https://stackoverflow.com/a/3629861/387194
function union(x, y) {
  var obj = {};
  for (var i = x.length-1; i >= 0; -- i)
     obj[x[i]] = x[i];
  for (var i = y.length-1; i >= 0; -- i)
     obj[y[i]] = y[i];
  var res = []
  for (var k in obj) {
    if (obj.hasOwnProperty(k))  // <-- optional
      res.push(obj[k]);
  }
  return res;
}

// ---------------------------------------------------------------------------------------------------------
function intersection(a, b) {
    return a.filter(function(n) {
        return b.includes(n);
    });
}

// ---------------------------------------------------------------------------------------------------------
async function rmdir(dir) {
    return new Promise(function(resolve, reject) {
        fs.readdir(dir, async function(err, list) {
            if (err) {
                return reject(err);
            }
            for(var i = 0; i < list.length; i++) {
                var filename = path.join(dir, list[i]);
                var stat = await new Promise(function(resolve, reject) {
                    fs.stat(filename, function(err, stat) {
                        if (err) {
                            return reject(err);
                        }
                        resolve(stat);
                    });
                });
                if (!filename.match(/^\.{1,2}$/)) {
                    if(stat.isDirectory()) {
                        await rmdir(filename);
                    } else {
                        await new Promise(function(resolve, reject) {
                            fs.unlink(filename, function(err) {
                                if (err) {
                                    return reject(err);
                                }
                                resolve();
                            });
                        });
                    }
                }
            }
            fs.rmdir(dir, resolve);
        });
    });
}



// ---------------------------------------------------------------------------------------------------------
async function listBranchFiles({dir, branch}) {
    const sha = await git.resolveRef({ dir, ref: `refs/remotes/origin/${branch}` });
    const { object: { tree } } = await git.readObject({ dir, oid: sha });
    var list = [];
    return traverseCommit({dir, sha, callback: ({filepath}) => list.push(filepath)}).then(() => list);
}
// ---------------------------------------------------------------------------------------------------------
async function traverseCommit({dir, sha, callback = $.noop}) {
    const { object: { tree } } = await git.readObject({ dir, oid: sha });
    return await (async function readFiles(oid, path) {
        const { object: { entries } } = await git.readObject({ dir, oid});
        var i = 0;
        return (async function loop() {
            var entry = entries[i++];
            if (entry) {
                if (entry.type == 'blob') {
                    var filepath = path.concat(entry.path).join('/');
                    await callback({entry, filepath, oid: entry.oid});
                } else if (entry.type == 'tree' && entry.path !== '.git') {
                    await readFiles(entry.oid, path.concat(entry.path));
                }
                return loop();
            }
        })();
    })(tree, []);
}

// ---------------------------------------------------------------------------------------------------------
async function gitCommitDiff({dir, newSha, oldSha}) {
    var result = {};
    function reader(name) {
        return async ({filepath, oid}) => {
            try {
                const { object: pkg } = await git.readObject({ dir, oid });
                result[filepath] = result[filepath] || {};
                result[filepath][name] = pkg.toString('utf8');
            } catch(e) {
                // ignore missing file/object
            }
        };
    }
    await traverseCommit({dir, sha: oldSha, callback: reader('oldFile')});
    await traverseCommit({dir, sha: newSha, callback: reader('newFile')});
    Object.keys(result).forEach(key => {
        var diff = JsDiff.structuredPatch(key, key, result[key].oldFile || '', result[key].newFile || '');
        if (typeof result[key].oldFile === 'undefined') {
            result[key].added = true;
        } else if (typeof result[key].newFile === 'undefined') {
            result[key].deleted = true;
        } else if (!diff.hunks.length) {
            delete result[key];
        }
        if (diff.hunks.length) {
            result[key].diff = diff;
        }
    });
    return result;
}

// ---------------------------------------------------------------------------------------------------------
function diffStat(diffs) {
    var modifications = diffs.reduce((acc, {hunks}) => {
        hunks.forEach(function(hunk) {
            hunk.lines.forEach((line) => {
                if (line[0] === '-') {
                    acc.minus++;
                } else if (line[0] === '+') {
                    acc.plus++;
                }
            });
        });
        return acc;
    }, {plus: 0, minus: 0});
    const plural = n => n == 1 ? '' : 's';
    var stat = [' ' + diffs.length + ' file' + plural(diffs.length)];
    if (modifications.plus) {
        stat.push(`${modifications.plus} insertion${plural(modifications.plus)}(+)`);
    }
    if (modifications.minus) {
        stat.push(`${modifications.minus} insertion${plural(modifications.minus)}(-)`);
    }
    return stat.join(', ');
}

// ---------------------------------------------------------------------------------------------------------
async function readBranchFile({ dir, filepath, branch }) {
    const ref = 'refs/remotes/origin/' + branch;
    const sha = await git.resolveRef({ dir,  ref });
    const { object: { tree } } = await git.readObject({ dir, oid: sha });
    return (async function loop(tree, path) {
        if (!path.length) {
            throw new Error(`File ${filepath} not found`);
        }
        var name = path.shift();
        const { object: { entries } } = await git.readObject({ dir, oid: tree });
        const packageEntry = entries.find((entry) => entry.path === name);
        if (!packageEntry) {
            throw new Error(`File ${filepath} not found`);
        } else {
            if (packageEntry.type == 'blob') {
                const { object: pkg } = await git.readObject({ dir, oid: packageEntry.oid })
                return pkg.toString('utf8');
            } else if (packageEntry.type == 'tree') {
                return loop(packageEntry.oid, path);
            }
        }
    })(tree, filepath.split('/'));
}
const padleft = (input, n, str) => (new Array(n + 1).join(str || ' ') + input).slice(-n);
const padright = (input, n, str) => (input + new Array(n + 1).join(str || ' ')).substring(0, n);
// ---------------------------------------------------------------------------------------------------------
function date(timestamp, timezoneOffset) {
    timezoneOffset *= -1;
    var d = new Date(timestamp * 1000);
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = [
        'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
        'September', 'October', 'November', 'December'
    ];
    var day = days[d.getDay()].substring(0, 3);
    var month = months[d.getMonth()].substring(0, 3);
    const pad = (input) => padleft(input, 2, '0');
    function offset(offset) {
        var timezone = ('0' + (offset / 60).toString().replace('.', '') + '00').slice(-4);
        return (offset > 1 ? '+' : '-') + timezone;
    }
    return [day, month, pad(d.getDate()),
            [pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds())].join(':'),
            d.getFullYear(),
            offset(timezoneOffset)
    ].join(' ');
}

// ---------------------------------------------------------------------------------------------------------
function gitroot(cwd) {
    return git.findRoot({filepath: cwd});
}
// ---------------------------------------------------------------------------------------------------------
async function gitBranch({cwd}) {
    try {
        var dir = await gitroot(cwd);
        return git.currentBranch({dir});
    } catch(e) {
    }
}
// ---------------------------------------------------------------------------------------------------------
function gitDiff({dir, filepath, branch}) {
    var fname = dir + '/' + filepath;
    return new Promise(function(resolve, reject) {
        fs.readFile(fname, async function(err, newFile) {
            if (!err) {
                newFile = newFile.toString();
            }
            readBranchFile({dir, branch, filepath}).then(oldFile => {
                const diff = JsDiff.structuredPatch(filepath, filepath, oldFile || '', newFile || '');
                resolve(diff);
            }).catch(err => reject(err));
        });
    });
}
// ---------------------------------------------------------------------------------------------------------
async function gitReset({git, dir, ref, branch, hard = false}) {
    var re = /^HEAD~([0-9]+)$/
    var m = ref.match(re);
    if (m) {
        var count = +m[1];
        var commits = await git.log({dir, depth: count + 1});
        return new Promise((resolve, reject) => {
            if (commits.length < count + 1) {
                return reject('Not enough commits');
            }
            var commit = commits.pop().oid;
            fs.writeFile(`${dir}/.git/refs/heads/${branch}`, commit + '\n', (err) => {
                if (err) {
                    return reject(err);
                }
                if (!hard) {
                    resolve();
                } else {
                    // clear the index (if any)
                    fs.unlink(`${dir}/.git/index`, (err) => {
                        if (err) {
                            return reject(err);
                        }
                        // checkout the branch into the working tree
                        git.checkout({ dir, ref: branch }).then(resolve);
                    });
                }
            });
        });
    }
    return Promise.reject(`Wrong ref ${ref}`);
}

// ---------------------------------------------------------------------------------------------------------
function gitURL({dir, gitdir = path.join(dir, '.git'), remote = 'origin'}) {
    return git.config({gitdir, path: `remote.${remote}.url`});
}

// ---------------------------------------------------------------------------------------------------------
async function repoURL({dir, gitdir = path.join(dir, '.git'), remote = 'origin'}) {
    var url = await gitURL({dir, gitdir, remote});
    return url.replace(/^https:\/\/jcubic.pl\/proxy.php\?/, '');
}

// ---------------------------------------------------------------------------------------------------------
function getHEAD({dir, gitdir, remote = false}) {
    if (!remote) {
        return git.resolveRef({dir, ref: 'HEAD'});
    } else {
        //return git.resolveRef({dir: 'test', ref: 'refs/remotes/origin/HEAD'});
    }
    return new Promise((resolve, reject) => {
        var base = `${dir}/${gitdir || '.git'}/`;
        var ref_file = remote ? `${base}refs/remotes/origin/HEAD` : `${base}HEAD`;
        fs.readFile(ref_file, function(err, data) {
            var ref;
            if (err) {
                //return reject(`can't read ${ref_file}: ${err}` );
                ref = 'refs/remotes/origin/master';
            } else {
                ref = data.toString().match(/ref: (.*)/)[1];
            }
            fs.readFile(base + ref, function(err, data) {
                if (err) {
                    return reject(`can't read ${base + ref}: ${err}`);
                }
                resolve(data.toString().trim());
            });
        });
    });
}

// ---------------------------------------------------------------------------------------------------------
function mkdir(dir, parent = false) {
    return new Promise(function(resolve, reject) {
        if (parent) {
            dir = dir.split('/');
            if (!dir.length) {
                return reject('Invalid argument');
            }
            var full_path = '/';
            (function loop() {
                if (!dir.length) {
                    return resolve();
                }
                full_path = path.join(full_path, dir.shift());
                fs.stat(full_path, function(err, stat) {
                    if (err) {
                        fs.mkdir(full_path, function(err) {
                            if (err) {
                                reject(err);
                            } else {
                                loop();
                            }
                        });
                    } else if (stat) {
                        if (stat.isDirectory()) {
                            loop();
                        } else if (stat.isFile()) {
                            reject(`${full_path} is a file`);
                        }
                    }
                });
            })();
        } else {
            fs.stat(dir, function(err, stat) {
                if (err) {
                    fs.mkdir(dir, function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                } else if (stat) {
                    if (stat.isDirectory()) {
                        reject('Directory already exists');
                    } else if (stat.isFile()) {
                        reject(`${dir} is a File`);
                    }
                }
            });
        }
    });
}

// ---------------------------------------------------------------------------------------------------------
async function makeZip(dir, filepath) {
    dir = dir.replace(/\/?$/, '/');
    var zip = new JSZip();
    var directories = {};
    var re = new RegExp('^' + dir);
    await traverseDirectory(dir, async function(stat, filepath) {
        var relPath = filepath.replace(re, '').replace(/^\//, '');
        if (stat == 'directory') {
            if (filepath !== dir) {
                console.log({relPath});
                directories[relPath] = zip.folder(relPath);
            }
        } else if (stat == 'file') {
            var parts = relPath.split('/');
            var filename = parts.pop();
            var dir = parts.join('/');
            console.log({dir, filename});
            await new Promise(function(resolve, reject) {
                console.log(filepath);
                fs.readFile(filepath, function(err, data) {
                    if (err) {
                        return reject(err);
                    }
                    var blob = new Blob([data], {
                        type : "text/plain"
                    });
                    (directories[dir] || zip).file(filename, data);
                    resolve();
                });
            });
        }
    }, {parentFirst: true});
    return writeZip(zip, filepath);
}

// ---------------------------------------------------------------------------------------------------------
function writeZip(zip, filepath) {
    return new Promise(function(resolve, reject) {
        zip.generateAsync({type:"blob"}).then(function(blob) {
            var fileReader = new FileReader();
            fileReader.onload = function() {
                var arrayBuffer = this.result;
                fs.writeFile(filepath, new buffer.Buffer(arrayBuffer), function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            };
            fileReader.readAsArrayBuffer(blob);
        });
    });
}

// ---------------------------------------------------------------------------------------------------------
function traverseDirectory(dir, callback, options) {
    var settings = Object.assign({}, {
        parentFirst: false
    }, options);
    return new Promise(function(resolve, reject) {
        fs.readdir(dir, async function(err, list) {
            if (err) {
                return reject(err);
            }
            if (settings.parentFirst) {
                await callback('directory', dir);
            }
            for (var i = 0; i < list.length; i++) {
                var filename = path.join(dir, list[i]);
                var stat = await new Promise(function(resolve, reject) {
                    fs.stat(filename, function(err, stat) {
                        if (err) {
                            return reject(err);
                        }
                        resolve(stat);
                    });
                });
                if (!filename.match(/^\.{1,2}$/)) {
                    if (stat.isDirectory()) {
                        await traverseDirectory(filename, callback, options);
                    } else {
                        await callback('file', filename);
                    }
                }
            }
            if (!settings.parentFirst) {
                await callback('directory', dir);
            }
            resolve();
        });
    });
}
